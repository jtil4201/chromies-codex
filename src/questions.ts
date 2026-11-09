import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Category = 'lore' | 'quests' | 'zones' | 'items' | 'general' | 'forever';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Version = 'classic' | 'forever' | 'retail';

export interface Question {
  id: string;
  category: Category;
  version?: Version;
  difficulty: Difficulty;
  question: string;
  options: string[];
  answer: number;
  fact?: string;
}

export const categories: Category[] = ['lore', 'quests', 'zones', 'items', 'general', 'forever'];
const versionOrder: Version[] = ['classic', 'forever', 'retail'];

export const pointsByDifficulty: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

const here = dirname(fileURLToPath(import.meta.url));
const questionsPath = join(here, '..', 'data', 'questions.json');

const all: Question[] = JSON.parse(readFileSync(questionsPath, 'utf8')) as Question[];

function questionVersion(q: Question): Version {
  return q.version ?? 'forever';
}

// Only surface versions that actually have questions, so the selector never offers an empty set.
export const versions: Version[] = versionOrder.filter((v) => all.some((q) => questionVersion(q) === v));

export function randomQuestion(category?: Category, version?: Version): Question {
  const pool = all.filter(
    (q) => (!category || q.category === category) && (!version || questionVersion(q) === version),
  );
  const source = pool.length > 0 ? pool : all;
  return source[Math.floor(Math.random() * source.length)];
}

// Distinct questions for a round; falls back to the full bank if the filter is too narrow.
export function randomQuestions(count: number, category?: Category, version?: Version): Question[] {
  const pool = all.filter(
    (q) => (!category || q.category === category) && (!version || questionVersion(q) === version),
  );
  const source = (pool.length > 0 ? pool : all).slice();
  for (let i = source.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [source[i], source[j]] = [source[j], source[i]];
  }
  return source.slice(0, Math.min(count, source.length));
}

export function questionCount(): number {
  return all.length;
}
