import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Category = 'lore' | 'quests' | 'zones' | 'items' | 'general' | 'forever';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: string;
  category: Category;
  difficulty: Difficulty;
  question: string;
  options: string[];
  answer: number;
  fact?: string;
}

export const categories: Category[] = ['lore', 'quests', 'zones', 'items', 'general', 'forever'];

export const pointsByDifficulty: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

const here = dirname(fileURLToPath(import.meta.url));
const questionsPath = join(here, '..', 'data', 'questions.json');

const all: Question[] = JSON.parse(readFileSync(questionsPath, 'utf8')) as Question[];

export function randomQuestion(category?: Category): Question {
  const pool = category ? all.filter((q) => q.category === category) : all;
  const source = pool.length > 0 ? pool : all;
  return source[Math.floor(Math.random() * source.length)];
}

export function questionCount(): number {
  return all.length;
}
