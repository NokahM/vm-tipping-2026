import type { BonusQuestion, KnockoutTip, Participant } from '../types';
import { STORAGE_KEYS } from '../config';

/** Sluttspill-tips lagt inn via admin: deltakernavn → tips (nøklet på apiId). */
export type KnockoutStore = Record<string, KnockoutTip[]>;

/**
 * En krydder-fasit: enten en ren verdi, eller `{ answer, at }` der `at` er ISO-datoen
 * fasiten ble avgjort (brukt av utviklingsgrafen). Ren verdi = ingen dato (bakoverkompatibelt
 * med eksisterende `bonusAnswers.json`).
 */
export type BonusValue = string | string[] | { answer: string | string[]; at?: string };

/** Krydder-fasit lagt inn via admin: questionId → fasit (med valgfri dato). */
export type BonusStore = Record<string, BonusValue>;

/** Selve svaret ut av en BonusValue (uten dato). */
export function bonusAnswerOf(v: BonusValue): string | string[] {
  return typeof v === 'string' || Array.isArray(v) ? v : v.answer;
}

/** «Avgjort»-datoen (ISO) hvis satt, ellers undefined. */
export function bonusDateOf(v: BonusValue): string | undefined {
  return typeof v === 'string' || Array.isArray(v) ? undefined : v.at;
}

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
  return questions.map((q) => (q.id in store ? { ...q, answer: bonusAnswerOf(store[q.id]) } : q));
}
