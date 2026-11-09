import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { theme } from './config.js';
import { Category, categories, questionCount } from './questions.js';
import { startTrivia } from './trivia.js';
import { resetGuild, topPlayers } from './store.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Chromie asks a WoW Forever trivia question')
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Pick a category, or leave it to chance')
        .addChoices(...categories.map((c) => ({ name: c, value: c }))),
    ),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top trivia players on this server'),
  new SlashCommandBuilder()
    .setName('codex')
    .setDescription('About Chromie’s Codex'),
  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Clear this server’s trivia leaderboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((command) => command.toJSON());

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName === 'trivia') {
    const category = (interaction.options.getString('category') as Category | null) ?? undefined;
    await startTrivia(interaction, category);
    return;
  }

  if (interaction.commandName === 'leaderboard') {
    await showLeaderboard(interaction);
    return;
  }

  if (interaction.commandName === 'codex') {
    await interaction.reply({
      content: `Chromie’s Codex keeps ${questionCount()} questions on WoW Forever lore, quests, zones, items, and more. Run /trivia to play.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === 'reset') {
    await resetLeaderboard(interaction);
  }
}

async function resetLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Leaderboards only exist inside a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You need the Manage Server permission to reset the leaderboard.', flags: MessageFlags.Ephemeral });
    return;
  }

  resetGuild(interaction.guildId);
  await interaction.reply('Leaderboard cleared. The Codex starts a fresh tally.');
}

async function showLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Leaderboards only exist inside a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  const players = topPlayers(interaction.guildId);
  if (players.length === 0) {
    await interaction.reply({ content: 'No scores yet. Run /trivia to get the Codex going.', flags: MessageFlags.Ephemeral });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const rows = players.map((player, i) => {
    const rank = medals[i] ?? `**${i + 1}.**`;
    return `${rank} ${player.name} — ${player.points} pts (${player.correct}/${player.answered})`;
  });

  const embed = new EmbedBuilder()
    .setColor(theme.gold)
    .setTitle('✦ Codex Leaderboard')
    .setDescription(rows.join('\n'))
    .setFooter({ text: theme.footer });

  await interaction.reply({ embeds: [embed] });
}
