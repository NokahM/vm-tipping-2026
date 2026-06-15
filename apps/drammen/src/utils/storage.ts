import type { BonusQuestion, KnockoutTip, Participant } from '../types';
import { STORAGE_KEYS } from '../config';

/** Sluttspill-tips lagt inn via admin: deltakernavn → tips (nøklet på apiId). */
export type KnockoutStore = Record<string, KnockoutTip[]>;

/**
 * En krydder-fasit. Enten en ren verdi, eller et objekt med dato(er) brukt av
 * utviklingsgrafen: `at` = når hele spørsmålet ble avgjort (enkelt-svar), `ats` = dato
 * per lag/element (liste-spørsmål, så hvert selvmål/rødt kort tikker inn på sin egen dag).
 * Ren verdi = ingen dato (bakoverkompatibelt med eksisterende `bonusAnswers.json`).
 */
export type BonusValue =
  | string
  | string[]
  | { answer: string | string[]; at?: string; ats?: Record<string, string>; decided?: boolean };

/** Krydder-fasit lagt inn via admin: questionId → fasit (med valgfrie datoer). */
export type BonusStore = Record<string, BonusValue>;

/** Selve svaret ut av en BonusValue (uten dato). */
export function bonusAnswerOf(v: BonusValue): string | string[] {
  return typeof v === 'string' || Array.isArray(v) ? v : v.answer;
}

/**
 * Er fasiten «avgjort» (skal score)? Admin styrer dette via «Avgjort»-checkboxen.
 * Rene verdier + objekter uten flagg regnes som avgjort (bakoverkompatibelt).
 * `decided: false` = lagret utkast som IKKE scorer (og ikke overstyrer auto).
 */
export function bonusDecidedOf(v: BonusValue): boolean {
  return typeof v === 'string' || Array.isArray(v) ? true : v.decided !== false;
}

/** Manuell-store filtrert til kun avgjorte entries (for fletting/scoring). */
export function decidedOnly(store: BonusStore): BonusStore {
  const out: BonusStore = {};
  for (const [id, v] of Object.entries(store)) if (bonusDecidedOf(v)) out[id] = v;
  return out;
}

/** Spørsmålets «avgjort»-dato (ISO) hvis satt, ellers undefined. */
export function bonusDateOf(v: BonusValue): string | undefined {
  return typeof v === 'string' || Array.isArray(v) ? undefined : v.at;
}

/** Per-lag/element-datoer (lag → ISO) for liste-spørsmål, hvis satt. */
export function bonusItemDatesOf(v: BonusValue): Record<string, string> | undefined {
  return typeof v === 'string' || Array.isArray(v) ? undefined : v.ats;
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
