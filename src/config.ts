import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

function optional(name: string): string {
  return process.env[name]?.trim() ?? '';
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: process.env.DISCORD_GUILD_ID ?? '',
  dataDir: process.env.DATA_DIR ?? './data',
  questionSeconds: Math.max(5, Number(process.env.QUESTION_SECONDS ?? '30')),
  questionsPerRound: Math.min(10, Math.max(1, Number(process.env.QUESTIONS_PER_ROUND ?? '5'))),
  // Daily auto-trivia (all optional; disabled unless a channel is set)
  dailyChannelId: optional('DAILY_TRIVIA_CHANNEL_ID'),
  dailyHour: Math.min(23, Math.max(0, Number(process.env.DAILY_TRIVIA_HOUR ?? '18'))),
  dailyTz: optional('DAILY_TRIVIA_TZ') || 'America/Phoenix',
  dailyPingRoleId: optional('DAILY_TRIVIA_PING_ROLE_ID'),
  // Auto-granted role for the current all-time #1 (optional)
  championRoleId: optional('CHAMPION_ROLE_ID'),
};

export const theme = {
  gold: 0xd4a847,
  bronze: 0x6b5836,
  night: 0x1a1410,
  footer: 'Chromie’s Codex',
};
