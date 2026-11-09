import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

export interface PlayerScore {
  name: string;
  points: number;
  correct: number;
  answered: number;
}

type GuildScores = Record<string, PlayerScore>;
type AllScores = Record<string, GuildScores>;

const file = join(config.dataDir, 'scores.json');

function load(): AllScores {
  if (!existsSync(file)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(file, 'utf8')) as AllScores;
  } catch {
    return {};
  }
}

function save(data: AllScores): void {
  mkdirSync(config.dataDir, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 2));
  renameSync(temp, file);
}

let cache: AllScores = load();

export function recordAnswer(guildId: string, userId: string, name: string, correct: boolean, points: number): PlayerScore {
  const guild = cache[guildId] ?? (cache[guildId] = {});
  const player = guild[userId] ?? (guild[userId] = { name, points: 0, correct: 0, answered: 0 });
  player.name = name;
  player.answered += 1;
  if (correct) {
    player.correct += 1;
    player.points += points;
  }

  save(cache);
  return player;
}

export function topPlayers(guildId: string, limit = 10): PlayerScore[] {
  const guild = cache[guildId] ?? {};
  return Object.values(guild)
    .sort((a, b) => b.points - a.points || b.correct - a.correct)
    .slice(0, limit);
}
