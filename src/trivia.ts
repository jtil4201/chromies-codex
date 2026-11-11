import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Message,
  MessageFlags,
} from 'discord.js';
import { config, theme } from './config.js';
import { Category, Version, Question, pointsByDifficulty, randomQuestions } from './questions.js';
import { recordAnswer, rolloverIfNeeded, championId, getSettings } from './store.js';

const letters = ['A', 'B', 'C', 'D'];
const running = new Set<string>();

interface RoundScore {
  name: string;
  correct: number;
  points: number;
  streak: number;
  onFire: boolean;
}

interface RoundOptions {
  category?: Category;
  version?: Version;
  count?: number;
  intro?: string;
  pingRoleId?: string;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function buildButtons(disabled: boolean, revealIndex?: number): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < letters.length; i++) {
    const button = new ButtonBuilder().setCustomId(`ans:${i}`).setLabel(letters[i]).setDisabled(disabled);
    if (revealIndex === undefined) button.setStyle(ButtonStyle.Primary);
    else if (i === revealIndex) button.setStyle(ButtonStyle.Success);
    else button.setStyle(ButtonStyle.Secondary);
    row.addComponents(button);
  }
  return row;
}

const progress = (index: number, total: number): string => `Question ${index + 1} of ${total}`;

function questionEmbed(question: Question, deadline: number, index: number, total: number): EmbedBuilder {
  const lines = question.options.map((option, i) => `**${letters[i]})** ${option}`);
  const points = pointsByDifficulty[question.difficulty];
  return new EmbedBuilder()
    .setColor(theme.gold)
    .setTitle(`✦ Chromie’s Codex — ${progress(index, total)}`)
    .setDescription(`${question.question}\n\n${lines.join('\n')}\n\n⏳ Answer closes <t:${deadline}:R> — faster correct answers score more.`)
    .setFooter({ text: `${question.category} • ${question.difficulty} • ${points} base pts` });
}

function resultEmbed(question: Question, winners: string[], index: number, total: number): EmbedBuilder {
  const correct = `**${letters[question.answer]})** ${question.options[question.answer]}`;
  const roll = winners.length > 0 ? winners.join('\n') : 'Nobody this time.';
  const embed = new EmbedBuilder()
    .setColor(theme.bronze)
    .setTitle(`✦ ${progress(index, total)} — Time’s up`)
    .setDescription(`Correct answer: ${correct}`)
    .addFields({ name: 'Scored', value: roll });
  if (question.fact) embed.addFields({ name: 'Lore', value: question.fact });
  return embed;
}

function summaryEmbed(round: Map<string, RoundScore>, total: number, showSweep: boolean): EmbedBuilder {
  const ranked = [...round.values()].sort((a, b) => b.points - a.points || b.correct - a.correct);
  const medals = ['🥇', '🥈', '🥉'];
  const body =
    ranked.length > 0
      ? ranked
          .map((r, i) => {
            const sweep = showSweep && r.correct === total ? ' 🐉 **Flawless!**' : '';
            return `${medals[i] ?? `**${i + 1}.**`} ${r.name} — ${r.points} pts (${r.correct}/${total})${sweep}`;
          })
          .join('\n')
      : 'No answers locked in this round.';
  return new EmbedBuilder()
    .setColor(theme.gold)
    .setTitle(`✦ Round complete — ${total} questions`)
    .setDescription(body)
    .setFooter({ text: `${theme.footer} • scores added to /leaderboard` });
}

async function runQuestion(
  channel: GuildTextBasedChannel,
  question: Question,
  index: number,
  total: number,
  guildId: string,
  round: Map<string, RoundScore>,
  flags: { speedBonus: boolean; streaks: boolean },
): Promise<void> {
  const base = pointsByDifficulty[question.difficulty];
  const picks = new Map<string, { name: string; index: number; remaining: number }>();
  const deadline = Math.floor(Date.now() / 1000) + config.questionSeconds;

  const message: Message = await channel.send({
    embeds: [questionEmbed(question, deadline, index, total)],
    components: [buildButtons(false)],
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: config.questionSeconds * 1000,
  });

  collector.on('collect', async (press) => {
    if (picks.has(press.user.id)) {
      await press.reply({ content: 'You already locked in an answer.', flags: MessageFlags.Ephemeral }).catch(() => undefined);
      return;
    }
    const pickIndex = Number(press.customId.split(':')[1]);
    const member = press.member instanceof GuildMember ? press.member : null;
    const name = member?.displayName ?? press.user.username;
    const remaining = Math.max(0, deadline - Math.floor(Date.now() / 1000));
    picks.set(press.user.id, { name, index: pickIndex, remaining });
    await press.reply({ content: `Locked in **${letters[pickIndex]}**.`, flags: MessageFlags.Ephemeral }).catch(() => undefined);
  });

  await new Promise<void>((resolve) => {
    collector.on('end', async () => {
      const winners: string[] = [];
      for (const [userId, pick] of picks) {
        const correct = pick.index === question.answer;
        const row = round.get(userId) ?? { name: pick.name, correct: 0, points: 0, streak: 0, onFire: false };
        row.name = pick.name;

        let gained = 0;
        if (correct) {
          const speedBonus = flags.speedBonus ? Math.round((pick.remaining / config.questionSeconds) * 2) : 0; // 0..2
          let streakBonus = 0;
          if (flags.streaks) {
            row.streak += 1;
            streakBonus = row.streak >= 3 ? 1 : 0;
            row.onFire = row.streak >= 3;
          }
          gained = base + speedBonus + streakBonus;
          row.correct += 1;
          row.points += gained;
          const extra = speedBonus + streakBonus;
          const flames = row.onFire ? ' 🔥' : '';
          winners.push(`${pick.name}${flames} — +${gained}${extra > 0 ? ` (bonus +${extra})` : ''}`);
        } else {
          row.streak = 0;
          row.onFire = false;
        }
        round.set(userId, row);
        recordAnswer(guildId, userId, pick.name, correct, gained);
      }

      await message
        .edit({ embeds: [resultEmbed(question, winners, index, total)], components: [buildButtons(true, question.answer)] })
        .catch(() => undefined);
      resolve();
    });
  });
}

async function syncChampion(guild: Guild): Promise<void> {
  if (!config.championRoleId) return;
  try {
    const role = await guild.roles.fetch(config.championRoleId);
    if (!role) return;
    const champ = championId(guild.id);
    const holders = role.members;
    for (const [memberId, member] of holders) {
      if (memberId !== champ) await member.roles.remove(role).catch(() => undefined);
    }
    if (champ && !holders.has(champ)) {
      const member = await guild.members.fetch(champ).catch(() => null);
      if (member) await member.roles.add(role).catch(() => undefined);
    }
  } catch {
    // role hierarchy / permission issues are non-fatal to the game
  }
}

export async function runRound(channel: GuildTextBasedChannel, guildId: string, opts: RoundOptions = {}): Promise<boolean> {
  if (running.has(channel.id)) return false;
  running.add(channel.id);
  try {
    const settings = getSettings(guildId);
    const ended = settings.seasons ? rolloverIfNeeded(guildId) : null;
    if (ended) {
      const medals = ['🥇', '🥈', '🥉'];
      const board = ended.top.map((p, i) => `${medals[i]} ${p.name} — ${p.points} pts`).join('\n');
      await channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(theme.gold)
              .setTitle(`🏆 Season ${ended.seasonId} results`)
              .setDescription(`${board}\n\nA new season begins now — everyone starts fresh!`)
              .setFooter({ text: theme.footer }),
          ],
        })
        .catch(() => undefined);
    }

    if (opts.intro) {
      await channel
        .send({
          content: opts.pingRoleId ? `<@&${opts.pingRoleId}>` : undefined,
          embeds: [new EmbedBuilder().setColor(theme.gold).setTitle('🕰️ Chromie’s Daily Trivia').setDescription(opts.intro).setFooter({ text: theme.footer })],
          allowedMentions: opts.pingRoleId ? { roles: [opts.pingRoleId] } : undefined,
        })
        .catch(() => undefined);
      await delay(2500);
    }

    const total = Math.min(10, Math.max(1, opts.count ?? config.questionsPerRound));
    const questions = randomQuestions(total, opts.category, opts.version);
    const round = new Map<string, RoundScore>();
    const flags = { speedBonus: settings.speedBonus, streaks: settings.streaks };
    for (let i = 0; i < questions.length; i++) {
      await runQuestion(channel, questions[i], i, questions.length, guildId, round, flags);
      if (i < questions.length - 1) await delay(3000);
    }
    await channel.send({ embeds: [summaryEmbed(round, questions.length, settings.sweep)] }).catch(() => undefined);
    if (settings.champion) await syncChampion(channel.guild);
    return true;
  } finally {
    running.delete(channel.id);
  }
}

export async function startTrivia(interaction: ChatInputCommandInteraction, category?: Category, version?: Version, count?: number): Promise<void> {
  const channel = interaction.channel;
  if (!interaction.guildId || !channel || !channel.isTextBased() || channel.isDMBased()) {
    await interaction.reply({ content: 'Chromie only runs trivia inside a server channel.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (running.has(channel.id)) {
    await interaction.reply({ content: 'A round is already running in this channel. Finish that one first.', flags: MessageFlags.Ephemeral });
    return;
  }
  const roundSize = Math.min(10, Math.max(1, count ?? config.questionsPerRound));
  await interaction.reply({ content: `Starting a ${roundSize}-question round — good luck!`, flags: MessageFlags.Ephemeral });
  await runRound(channel as GuildTextBasedChannel, interaction.guildId, { category, version, count });
}
