import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
} from 'discord.js';
import { config, theme } from './config.js';
import { Category, Question, pointsByDifficulty, randomQuestion } from './questions.js';
import { recordAnswer } from './store.js';

const letters = ['A', 'B', 'C', 'D'];
const running = new Set<string>();

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

function questionEmbed(question: Question, deadline: number): EmbedBuilder {
  const lines = question.options.map((option, i) => `**${letters[i]})** ${option}`);
  const points = pointsByDifficulty[question.difficulty];

  return new EmbedBuilder()
    .setColor(theme.gold)
    .setTitle('✦ Chromie’s Codex')
    .setDescription(`${question.question}\n\n${lines.join('\n')}\n\n⏳ Answer closes <t:${deadline}:R>`)
    .setFooter({
      text: `${question.category} • ${question.difficulty} • ${points} pts`,
    });
}

function resultEmbed(question: Question, winners: string[]): EmbedBuilder {
  const points = pointsByDifficulty[question.difficulty];
  const correct = `**${letters[question.answer]})** ${question.options[question.answer]}`;
  const roll = winners.length > 0 ? winners.join(', ') : 'Nobody this time.';

  const embed = new EmbedBuilder()
    .setColor(theme.bronze)
    .setTitle('✦ Time’s up')
    .setDescription(`${question.question}\n\nCorrect answer: ${correct}`)
    .addFields({ name: `Scored ${points} pts`, value: roll });

  if (question.fact) {
    embed.addFields({ name: 'Lore', value: question.fact });
  }

  return embed;
}

export async function startTrivia(interaction: ChatInputCommandInteraction, category?: Category): Promise<void> {
  const channelId = interaction.channelId;
  if (running.has(channelId)) {
    await interaction.reply({ content: 'A question is already running in this channel. Finish that one first.', flags: MessageFlags.Ephemeral });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: 'Chromie only runs trivia inside a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  running.add(channelId);
  const question = randomQuestion(category);
  const points = pointsByDifficulty[question.difficulty];
  const picks = new Map<string, { name: string; index: number }>();
  const deadline = Math.floor(Date.now() / 1000) + config.questionSeconds;

  await interaction.reply({ embeds: [questionEmbed(question, deadline)], components: [buildButtons(false)] });
  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: config.questionSeconds * 1000,
  });

  collector.on('collect', async (press) => {
    if (picks.has(press.user.id)) {
      await press.reply({ content: 'You already locked in an answer.', flags: MessageFlags.Ephemeral });
      return;
    }

    const index = Number(press.customId.split(':')[1]);
    const member = press.member instanceof GuildMember ? press.member : null;
    const name = member?.displayName ?? press.user.username;
    picks.set(press.user.id, { name, index });
    await press.reply({ content: `Locked in **${letters[index]}**.`, flags: MessageFlags.Ephemeral });
  });

  collector.on('end', async () => {
    running.delete(channelId);
    const winners: string[] = [];

    for (const [userId, pick] of picks) {
      const correct = pick.index === question.answer;
      recordAnswer(guildId, userId, pick.name, correct, points);
      if (correct) {
        winners.push(pick.name);
      }
    }

    await message.edit({
      embeds: [resultEmbed(question, winners)],
      components: [buildButtons(true, question.answer)],
    });
  });
}
