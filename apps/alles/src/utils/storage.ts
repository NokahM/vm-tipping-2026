import type { BonusQuestion, KnockoutTip, Participant } from '../types';
import { STORAGE_KEYS } from '../config';

/** Sluttspill-tips lagt inn via admin: deltakernavn → tips (nøklet på apiId). */
export type KnockoutStore = Record<string, KnockoutTip[]>;

/** Krydder-fasit lagt inn via admin: questionId → fasit. */
export type BonusStore = Record<string, string | string[]>;

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadKnockoutStore(): KnockoutStore {
  return read<KnockoutStore>(STORAGE_KEYS.knockoutTips, {});
}

export function saveKnockoutStore(store: KnockoutStore): void {
  write(STORAGE_KEYS.knockoutTips, store);
}

export function loadBonusStore(): BonusStore {
  return read<BonusStore>(STORAGE_KEYS.bonusAnswers, {});
}

export function saveBonusStore(store: BonusStore): void {
  write(STORAGE_KEYS.bonusAnswers, store);
}

/** Fletter admin-lagrede sluttspill-tips inn i deltakerne. */
export function mergeKnockoutTips(participants: Participant[], store: KnockoutStore): Participant[] {
  return participants.map((p) =>
    store[p.name]?.length ? { ...p, knockoutTips: store[p.name] } : p,
  );
}

/** Overstyrer fasit på krydderspørsmål med admin-lagrede svar. */
export function applyBonusAnswers(questions: BonusQuestion[], store: BonusStore): BonusQuestion[] {
  return questions.map((q) => (q.id in store ? { ...q, answer: store[q.id] } : q));
}
