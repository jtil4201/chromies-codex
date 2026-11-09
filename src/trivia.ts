import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  GuildMember,
  Message,
  MessageFlags,
} from 'discord.js';
import { config, theme } from './config.js';
import { Category, Version, Question, pointsByDifficulty, randomQuestions } from './questions.js';
import { recordAnswer } from './store.js';

const letters = ['A', 'B', 'C', 'D'];
const running = new Set<string>();

interface RoundScore {
  name: string;
  correct: number;
  points: number;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function buildButtons(disabled: boolean, revealIndex?: number): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < letters.length; i++) {
    const button = new ButtonBuilder()
      .setCustomId(`ans:${i}`)
      .setLabel(letters[i])
      .setDisabled(disabled);

    if (revealIndex === undefined) {
      button.setStyle(ButtonStyle.Primary);
    } else if (i === revealIndex) {
      button.setStyle(ButtonStyle.Success);
    } else {
      button.setStyle(ButtonStyle.Secondary);
    }

    row.addComponents(button);
  }

  return row;
}

function progress(index: number, total: number): string {
  return `Question ${index + 1} of ${total}`;
}

function questionEmbed(question: Question, deadline: number, index: number, total: number): EmbedBuilder {
  const lines = question.options.map((option, i) => `**${letters[i]})** ${option}`);
  const points = pointsByDifficulty[question.difficulty];

  return new EmbedBuilder()
    .setColor(theme.gold)
    .setTitle(`✦ Chromie’s Codex — ${progress(index, total)}`)
    .setDescription(`${question.question}\n\n${lines.join('\n')}\n\n⏳ Answer closes <t:${deadline}:R>`)
    .setFooter({
      text: `${question.category} • ${question.difficulty} • ${points} pts`,
    });
}

function resultEmbed(question: Question, winners: string[], index: number, total: number): EmbedBuilder {
  const points = pointsByDifficulty[question.difficulty];
  const correct = `**${letters[question.answer]})** ${question.options[question.answer]}`;
  const roll = winners.length > 0 ? winners.join(', ') : 'Nobody this time.';

  const embed = new EmbedBuilder()
    .setColor(theme.bronze)
    .setTitle(`✦ ${progress(index, total)} — Time’s up`)
    .setDescription(`${question.question}\n\nCorrect answer: ${correct}`)
    .addFields({ name: `Scored ${points} pts`, value: roll });

  if (question.fact) {
    embed.addFields({ name: 'Lore', value: question.fact });
  }

  return embed;
}

function summaryEmbed(round: Map<string, RoundScore>, total: number): EmbedBuilder {
  const ranked = [...round.values()].sort((a, b) => b.points - a.points || b.correct - a.correct);
  const medals = ['🥇', '🥈', '🥉'];
  const body =
    ranked.length > 0
      ? ranked
          .map((r, i) => `${medals[i] ?? `**${i + 1}.**`} ${r.name} — ${r.points} pts (${r.correct}/${total})`)
          .join('\n')
      : 'No answers locked in this round.';

  return new EmbedBuilder()
    .setColor(theme.gold)
    .setTitle(`✦ Round complete — ${total} questions`)
    .setDescription(body)
    .setFooter({ text: `${theme.footer} • scores added to /leaderboard` });
}

async function runQuestion(
  interaction: ChatInputCommandInteraction,
  question: Question,
  index: number,
  total: number,
  guildId: string,
  round: Map<string, RoundScore>,
): Promise<void> {
  const points = pointsByDifficulty[question.difficulty];
  const picks = new Map<string, { name: string; index: number }>();
  const deadline = Math.floor(Date.now() / 1000) + config.questionSeconds;
  const embed = questionEmbed(question, deadline, index, total);

  let message: Message;
  if (index === 0) {
    await interaction.reply({ embeds: [embed], components: [buildButtons(false)] });
    message = await interaction.fetchReply();
  } else {
    message = (await interaction.followUp({ embeds: [embed], components: [buildButtons(false)] })) as Message;
  }

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: config.questionSeconds * 1000,
  });

  collector.on('collect', async (press) => {
    if (picks.has(press.user.id)) {
      await press.reply({ content: 'You already locked in an answer.', flags: MessageFlags.Ephemeral });
      return;
    }

    const pickIndex = Number(press.customId.split(':')[1]);
    const member = press.member instanceof GuildMember ? press.member : null;
    const name = member?.displayName ?? press.user.username;
    picks.set(press.user.id, { name, index: pickIndex });
    await press.reply({ content: `Locked in **${letters[pickIndex]}**.`, flags: MessageFlags.Ephemeral });
  });

  await new Promise<void>((resolve) => {
    collector.on('end', async () => {
      const winners: string[] = [];

      for (const [userId, pick] of picks) {
        const correct = pick.index === question.answer;
        recordAnswer(guildId, userId, pick.name, correct, points);
        const row = round.get(userId) ?? { name: pick.name, correct: 0, points: 0 };
        row.name = pick.name;
        if (correct) {
          row.correct += 1;
          row.points += points;
          winners.push(pick.name);
        }
        round.set(userId, row);
      }

      await message.edit({
        embeds: [resultEmbed(question, winners, index, total)],
        components: [buildButtons(true, question.answer)],
      });
      resolve();
    });
  });
}

export async function startTrivia(interaction: ChatInputCommandInteraction, category?: Category, version?: Version): Promise<void> {
  const channelId = interaction.channelId;
  if (running.has(channelId)) {
    await interaction.reply({ content: 'A round is already running in this channel. Finish that one first.', flags: MessageFlags.Ephemeral });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'Chromie only runs trivia inside a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  running.add(channelId);
  try {
    const questions = randomQuestions(config.questionsPerRound, category, version);
    const round = new Map<string, RoundScore>();

    for (let i = 0; i < questions.length; i++) {
      await runQuestion(interaction, questions[i], i, questions.length, guildId, round);
      if (i < questions.length - 1) {
        await delay(3000);
      }
    }

    await interaction.followUp({ embeds: [summaryEmbed(round, questions.length)] });
  } finally {
    running.delete(channelId);
  }
}
