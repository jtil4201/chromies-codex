import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { config, theme } from './config.js';
import { Category, Version, categories, versions, questionCount } from './questions.js';
import { startTrivia } from './trivia.js';
import { resetGuild, topPlayers, topSeason, playerStats, getSettings, setFeature, featureKeys, FeatureKey } from './store.js';

const featureLabels: Record<FeatureKey, string> = {
  speedBonus: 'Speed bonus (faster answers score more)',
  streaks: 'Streak bonus (3+ in a row = 🔥 +pts)',
  sweep: 'Flawless sweep callout (5/5)',
  seasons: 'Weekly seasons (leaderboard resets Mondays)',
  daily: 'Daily auto-trivia',
  champion: 'Champion role for #1',
};

export const commands = [
  new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Chromie asks a WoW Forever trivia question')
    .addStringOption((option) =>
      option
        .setName('version')
        .setDescription('Pick a WoW version')
        .addChoices(...versions.map((v) => ({ name: v, value: v }))),
    )
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
    .setName('stats')
    .setDescription('Your trivia stats and rank')
    .addUserOption((option) => option.setName('player').setDescription('Whose stats to show (defaults to you)')),
  new SlashCommandBuilder()
    .setName('codex')
    .setDescription('About Chromie’s Codex'),
  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Clear this server’s trivia leaderboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('View or toggle Chromie features (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName('feature')
        .setDescription('Which feature to change')
        .addChoices(...featureKeys.map((k) => ({ name: k, value: k }))),
    )
    .addStringOption((option) =>
      option
        .setName('state')
        .setDescription('Turn it on or off')
        .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }),
    ),
].map((command) => command.toJSON());

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName === 'trivia') {
    const category = (interaction.options.getString('category') as Category | null) ?? undefined;
    const version = (interaction.options.getString('version') as Version | null) ?? undefined;
    await startTrivia(interaction, category, version);
    return;
  }

  if (interaction.commandName === 'leaderboard') {
    await showLeaderboard(interaction);
    return;
  }

  if (interaction.commandName === 'stats') {
    await showStats(interaction);
    return;
  }

  if (interaction.commandName === 'codex') {
    await interaction.reply({
      content: `Chromie’s Codex keeps ${questionCount()} questions on WoW Forever lore, quests, zones, items, and more. Run /trivia for a round of ${config.questionsPerRound} questions.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === 'reset') {
    await resetLeaderboard(interaction);
    return;
  }

  if (interaction.commandName === 'settings') {
    await handleSettings(interaction);
  }
}

async function handleSettings(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Settings only exist inside a server.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You need the Manage Server permission to change settings.', flags: MessageFlags.Ephemeral });
    return;
  }

  const feature = interaction.options.getString('feature') as FeatureKey | null;
  const state = interaction.options.getString('state');

  if (feature && state) {
    setFeature(interaction.guildId, feature, state === 'on');
  } else if (feature || state) {
    await interaction.reply({ content: 'Pass **both** a feature and a state (on/off) to change something, or neither to view current settings.', flags: MessageFlags.Ephemeral });
    return;
  }

  const settings = getSettings(interaction.guildId);
  const lines = featureKeys.map((k) => `${settings[k] ? '🟢 On ' : '🔴 Off'} — ${featureLabels[k]}`);
  const embed = new EmbedBuilder()
    .setColor(theme.gold)
    .setTitle('✦ Chromie settings')
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Toggle with /settings feature:<name> state:<on|off>' });

  const note = feature && state ? `Set **${feature}** to **${state}**.\n\n` : '';
  await interaction.reply({ content: note || undefined, embeds: [embed], flags: MessageFlags.Ephemeral });
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

function rankLines(players: { name: string; points: number; correct: number; answered: number }[]): string {
  const medals = ['🥇', '🥈', '🥉'];
  return players
    .map((player, i) => `${medals[i] ?? `**${i + 1}.**`} ${player.name} — ${player.points} pts (${player.correct}/${player.answered})`)
    .join('\n');
}

async function showLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Leaderboards only exist inside a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  const allTime = topPlayers(interaction.guildId, 5);
  if (allTime.length === 0) {
    await interaction.reply({ content: 'No scores yet. Run /trivia to get the Codex going.', flags: MessageFlags.Ephemeral });
    return;
  }

  const seasonsOn = getSettings(interaction.guildId).seasons;
  const season = topSeason(interaction.guildId, 5);
  const embed = new EmbedBuilder().setColor(theme.gold).setTitle('✦ Codex Leaderboard');
  if (seasonsOn) {
    embed.addFields(
      { name: '📅 This season', value: season.length ? rankLines(season) : 'No scores this season yet.' },
      { name: '🏛️ All time', value: rankLines(allTime) },
    );
    embed.setFooter({ text: `${theme.footer} • seasons reset weekly` });
  } else {
    embed.setDescription(rankLines(allTime)).setFooter({ text: theme.footer });
  }

  await interaction.reply({ embeds: [embed] });
}

async function showStats(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Stats only exist inside a server.', flags: MessageFlags.Ephemeral });
    return;
  }
  const target = interaction.options.getUser('player') ?? interaction.user;
  const stats = playerStats(interaction.guildId, target.id);
  if (!stats.score) {
    await interaction.reply({ content: `${target.username} hasn’t played a round yet. Run /trivia to start.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const acc = stats.score.answered > 0 ? Math.round((stats.score.correct / stats.score.answered) * 100) : 0;
  const seasonLine = stats.seasonScore
    ? `${stats.seasonScore.points} pts • rank #${stats.seasonRank} (${stats.seasonScore.correct}/${stats.seasonScore.answered})`
    : 'No games this season yet.';

  const embed = new EmbedBuilder()
    .setColor(theme.gold)
    .setTitle(`✦ ${target.username}’s Codex stats`)
    .addFields(
      { name: '🏛️ All time', value: `${stats.score.points} pts • rank #${stats.allTimeRank}`, inline: true },
      { name: '🎯 Accuracy', value: `${acc}% (${stats.score.correct}/${stats.score.answered})`, inline: true },
      { name: '📅 This season', value: seasonLine },
    )
    .setFooter({ text: theme.footer });

  await interaction.reply({ embeds: [embed] });
}
