import type { MatchResult } from '../types';
import type { StatsData } from '../hooks/useStats';
import type { BonusStore } from './storage';
import { matchDayKey } from './scoring';
import { normalizeTeamName } from './teamNames';
import { worstTeamSoFar } from './groupTables';

// Spiller-ID-er for app-spesifikke krydderspørsmål (bekreftet mot API-et).
const RONALDO_ID = 44;
const MESSI_ID = 3218;
const GLIMT_IDS = [37913, 37924, 37916]; // Bjørkan, Patrick Berg, Hauge

/** Noon-ISO for en kamps matchday (samme 12:00-grense som grafen/pilene). */
const noon = (utcDate: string) => `${matchDayKey(utcDate)}T12:00:00.000Z`;

/** Etternavn for å øke treff mot deltakernes svar (de skriver ofte bare etternavn). */
function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : full;
}

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

/** Finalen, ferdigspilt (markerer turneringsslutt for «lås når avgjort»). */
function finishedFinal(results: MatchResult[]): MatchResult | undefined {
  return results.find((m) => m.stage === 'FINAL' && m.status === 'FINISHED');
}

/**
 * Auto-krydder som trenger aggregator-data (deep data): q3 toppscorer, q11 finaledommer,
 * q13 Ronaldo/Messi, q16 Bodø/Glimt-spilletid. Slutt-tilstand-spørsmål låses kun når avgjort
 * (turneringen ferdig); q11/q16 låses så snart de er kjent. Flettes under manuell KV.
 */
export function deriveStatsBonus(stats: StatsData | null, results: MatchResult[]): BonusStore {
  const store: BonusStore = {};
  if (!stats) return store;
  const final = finishedFinal(results);
  const over = !!final;
  const endIso = final ? noon(final.utcDate) : `${latestDay(results)}T12:00:00.000Z`;

  // q11: finaledommer – så snart dommeren er kjent i API-et.
  if (stats.finalReferee) {
    store.q11 = { answer: stats.finalReferee, at: endIso };
  }

  // q3: toppscorer (Gullstøvelen) – når turneringen er ferdig. Likt antall mål → alle (medlemskap).
  if (over && stats.topScorers && stats.topScorers.length > 0) {
    const max = stats.topScorers[0].goals ?? 0;
    const names = stats.topScorers.filter((p) => (p.goals ?? 0) === max);
    const answer = [...new Set(names.flatMap((p) => [p.name, lastName(p.name)]))];
    store.q3 = { answer, at: endIso };
  }

  // q13: hvem scorer flest av Ronaldo og Messi – når turneringen er ferdig. Likt → begge.
  if (over) {
    const r = stats.goalsByPlayer?.[RONALDO_ID] ?? 0;
    const m = stats.goalsByPlayer?.[MESSI_ID] ?? 0;
    const answer: string[] = [];
    if (r >= m) answer.push('Ronaldo', 'Cristiano Ronaldo');
    if (m >= r) answer.push('Messi', 'Lionel Messi');
    store.q13 = { answer, at: endIso };
  }

  // q16: får alle tre Bodø/Glimt-spillerne spilletid? «Ja» så snart alle tre har spilt
  // (akkumulerende); ellers «Nei» først når turneringen er ferdig.
  const played = new Set(stats.playedIds ?? []);
  const all3 = GLIMT_IDS.every((id) => played.has(id));
  if (all3) store.q16 = { answer: 'Ja', at: endIso };
  else if (over) store.q16 = { answer: 'Nei', at: endIso };

  return store;
}
