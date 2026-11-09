import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: process.env.DISCORD_GUILD_ID ?? '',
  dataDir: process.env.DATA_DIR ?? './data',
  questionSeconds: Math.max(5, Number(process.env.QUESTION_SECONDS ?? '30')),
  questionsPerRound: Math.min(10, Math.max(1, Number(process.env.QUESTIONS_PER_ROUND ?? '5'))),
};

export const theme = {
  gold: 0xd4a847,
  bronze: 0x6b5836,
  night: 0x1a1410,
  footer: 'Chromie’s Codex',
};
