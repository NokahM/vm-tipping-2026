import type { MatchResult } from '../types';
import type { BonusStore } from './storage';
import { matchDayKey } from './scoring';
import { normalizeTeamName } from './teamNames';
import { worstTeamSoFar } from './groupTables';

/** Noon-ISO for en kamps matchday (samme 12:00-grense som grafen/pilene). */
const noon = (utcDate: string) => `${matchDayKey(utcDate)}T12:00:00.000Z`;

/** Seneste matchday-dato blant kampene (for «avgjort»-datoen). */
function latestDay(matches: MatchResult[]): string {
  return matches.reduce((d, m) => {
    const k = matchDayKey(m.utcDate);
    return k > d ? k : d;
  }, '');
}

/**
 * Auto-utledet krydder-fasit for «slutt-tilstand»-spørsmål – men KUN når de er **avgjort**
 * (fasen ferdig), så vi aldri scorer på en midlertidig leder. Datoen settes til den
 * avgjørende kampdagen (mater grafen). Flettes UNDER manuell KV-fasit (som overstyrer alltid).
 *
 * Pulje B (kjerne). q9 (gruppe), q3/q11/q13/q16 og q12/q14/q17 kommer i egne puljer.
 */
export function deriveDecidedBonus(results: MatchResult[]): BonusStore {
  const store: BonusStore = {};
  if (results.length === 0) return store;

  // q1: VM-vinner – når finalen er ferdig. Hopper over uavgjort (straffer kan ikke avgjøres
  // fra fullTime-score) → admin setter den i det sjeldne tilfellet.
  const final = results.find((m) => m.stage === 'FINAL');
  if (
    final &&
    final.status === 'FINISHED' &&
    final.homeGoals != null &&
    final.awayGoals != null &&
    final.homeGoals !== final.awayGoals
  ) {
    const winner = final.homeGoals > final.awayGoals ? final.homeTeam : final.awayTeam;
    store.q1 = { answer: normalizeTeamName(winner), at: noon(final.utcDate) };
  }

  // q5: antall mål totalt – når ALLE kamper er ferdige.
  if (results.every((m) => m.status === 'FINISHED')) {
    const total = results.reduce((s, m) => s + (m.homeGoals ?? 0) + (m.awayGoals ?? 0), 0);
    store.q5 = { answer: String(total), at: `${latestDay(results)}T12:00:00.000Z` };
  }

  // q10: dårligste lag – når gruppespillet er ferdig.
  const group = results.filter((m) => m.stage === 'GROUP_STAGE');
  if (group.length > 0 && group.every((m) => m.status === 'FINISHED')) {
    const worst = worstTeamSoFar(results);
    if (worst) {
      store.q10 = { answer: normalizeTeamName(worst.team), at: `${latestDay(group)}T12:00:00.000Z` };
    }
  }

  return store;
}
