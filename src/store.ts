import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

export interface PlayerScore {
  name: string;
  points: number;
  correct: number;
  answered: number;
}

type Book = Record<string, PlayerScore>;

interface SeasonState {
  seasonId: string;
  scores: Book;
}

interface Database {
  allTime: Record<string, Book>;
  season: Record<string, SeasonState>;
}

const file = join(config.dataDir, 'scores.json');

// ISO week id in the configured timezone, e.g. "2026-W46".
export function currentSeasonId(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.dailyTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  const day = (local.getUTCDay() + 6) % 7; // Monday = 0
  local.setUTCDate(local.getUTCDate() - day + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(local.getUTCFullYear(), 0, 4));
  const week =
    1 + Math.round(((local.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${local.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function load(): Database {
  if (!existsSync(file)) {
    return { allTime: {}, season: {} };
  }

  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    if (raw && typeof raw === 'object' && 'allTime' in (raw as Record<string, unknown>)) {
      const db = raw as Database;
      db.allTime ??= {};
      db.season ??= {};
      return db;
    }
    // migrate legacy flat shape: { [guildId]: Book } -> all-time
    return { allTime: (raw as Record<string, Book>) ?? {}, season: {} };
  } catch {
    return { allTime: {}, season: {} };
  }
}

function save(data: Database): void {
  mkdirSync(config.dataDir, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(data, null, 2));
  renameSync(temp, file);
}

const cache: Database = load();

function seasonBook(guildId: string): Book {
  const current = currentSeasonId();
  const state = cache.season[guildId];
  if (!state || state.seasonId !== current) {
    cache.season[guildId] = { seasonId: current, scores: {} };
  }
  return cache.season[guildId].scores;
}

export function recordAnswer(guildId: string, userId: string, name: string, correct: boolean, points: number): void {
  for (const book of [cache.allTime[guildId] ?? (cache.allTime[guildId] = {}), seasonBook(guildId)]) {
    const player = book[userId] ?? (book[userId] = { name, points: 0, correct: 0, answered: 0 });
    player.name = name;
    player.answered += 1;
    if (correct) {
      player.correct += 1;
      player.points += points;
    }
  }
  save(cache);
}

// If the stored season for this guild is stale, snapshot the ended season's top 3 and start fresh.
export function rolloverIfNeeded(guildId: string): { seasonId: string; top: PlayerScore[] } | null {
  const current = currentSeasonId();
  const state = cache.season[guildId];
  if (state && state.seasonId !== current) {
    const top = rank(state.scores).slice(0, 3);
    cache.season[guildId] = { seasonId: current, scores: {} };
    save(cache);
    if (top.length > 0) {
      return { seasonId: state.seasonId, top };
    }
  }
  return null;
}

function rank(book: Book, limit = 10): PlayerScore[] {
  return Object.values(book)
    .sort((a, b) => b.points - a.points || b.correct - a.correct)
    .slice(0, limit);
}

export function topPlayers(guildId: string, limit = 10): PlayerScore[] {
  return rank(cache.allTime[guildId] ?? {}, limit);
}

export function topSeason(guildId: string, limit = 10): PlayerScore[] {
  return rank(seasonBook(guildId), limit);
}

export function championId(guildId: string): string | null {
  const book = cache.allTime[guildId] ?? {};
  const ranked = Object.entries(book).sort((a, b) => b[1].points - a[1].points || b[1].correct - a[1].correct);
  return ranked[0]?.[0] ?? null;
}

export interface PlayerStats {
  score: PlayerScore | null;
  allTimeRank: number | null;
  seasonScore: PlayerScore | null;
  seasonRank: number | null;
}

function rankOf(book: Book, userId: string): number | null {
  const ranked = Object.entries(book).sort((a, b) => b[1].points - a[1].points || b[1].correct - a[1].correct);
  const idx = ranked.findIndex(([id]) => id === userId);
  return idx === -1 ? null : idx + 1;
}

export function playerStats(guildId: string, userId: string): PlayerStats {
  const all = cache.allTime[guildId] ?? {};
  const season = seasonBook(guildId);
  return {
    score: all[userId] ?? null,
    allTimeRank: rankOf(all, userId),
    seasonScore: season[userId] ?? null,
    seasonRank: rankOf(season, userId),
  };
}

export function resetGuild(guildId: string): void {
  delete cache.allTime[guildId];
  delete cache.season[guildId];
  save(cache);
}
