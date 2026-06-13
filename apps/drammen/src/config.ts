/**
 * App-spesifikk konfigurasjon. Dette er den eneste filen som skiller
 * Drammen-appen fra Alles-appen (utenom participants.ts / bonusQuestions.ts).
 */
export const APP_CONFIG = {
  /** Vennegruppens navn (vises i header). */
  groupName: 'Drammen',
  /** Suffiks brukt i localStorage-nøkler, f.eks. "knockout_tips_drammen". */
  storageSuffix: 'drammen',
} as const;

export const STORAGE_KEYS = {
  results: 'wc2026_results',
  knockoutTips: `knockout_tips_${APP_CONFIG.storageSuffix}`,
  bonusAnswers: `bonus_answers_${APP_CONFIG.storageSuffix}`,
} as const;
