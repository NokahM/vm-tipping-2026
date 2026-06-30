import type { MatchResult, Stage } from '../types';
import type { StatsData } from '../hooks/useStats';
import type { BonusStore } from './storage';
import { groupGoalLeaders, matchDayKey, playGoals, projectTotalGoals } from './scoring';
import { STAGE_LABELS, STAGE_ORDER } from './labels';
import { normalizeTeamName } from './teamNames';
import { worstTeamSoFar } from './groupTables';

// Spiller-ID-er for app-spesifikke krydderspørsmål (bekreftet mot API-et).
const RONALDO_ID = 44;
const MESSI_ID = 3218;
const GLIMT_IDS = [37913, 37924, 37916]; // Bjørkan, Patrick Berg, Hauge

// Referanselister (engelske API-lagnavn) for «kommer lengst»-spørsmålene.
const ISLAND_NATIONS = ['Japan', 'Haiti', 'New Zealand', 'Cape Verde Islands', 'Curaçao', 'Australia'];
// Afrikanske land i dette tippespillet.
const AFRICAN_NATIONS = [
  'Algeria',
  'Cape Verde Islands',
  'Congo DR',
  'Egypt',
  'Ghana',
  'Ivory Coast',
  'Morocco',
  'Senegal',
  'South Africa',
  'Tunisia',
];
const STAGE_RANK: Record<string, number> = Object.fromEntries(STAGE_ORDER.map((s, i) => [s, i]));

/** Lag i `list` som kom lengst (høyest stage). Likt → alle. `day` = den avgjørende kampdagen. */
function furthestAmong(list: string[], results: MatchResult[]): { teams: string[]; day: string } | null {
  const set = new Set(list);
  const best = new Map<string, { rank: number; day: string }>();
  for (const m of results) {
    const rank = STAGE_RANK[m.stage];
    if (rank == null) continue;
    const day = matchDayKey(m.utcDate);
    for (const team of [m.homeTeam, m.awayTeam]) {
      if (team === 'TBD' || !set.has(team)) continue;
      const cur = best.get(team);
      if (!cur || rank > cur.rank || (rank === cur.rank && day > cur.day)) best.set(team, { rank, day });
    }
  }
  if (best.size === 0) return null;
  const maxRank = Math.max(...[...best.values()].map((b) => b.rank));
  const teams = [...best].filter(([, b]) => b.rank === maxRank).map(([t]) => t);
  const day = teams.reduce((d, t) => (best.get(t)!.day > d ? best.get(t)!.day : d), '');
  return { teams, day };
}

/**
 * Lag i `list` som fortsatt KAN gå videre = har minst én kamp som ikke er ferdigspilt
 * (gjenstående gruppekamp, eller en allerede fylt sluttspill-slot). Robust på tvers av faser:
 * et utslått lag har ingen kommende kamp igjen. Brukes KUN til den visuelle live-indikatoren for
 * «kommer lengst»-spørsmålene (q12/q14) – aldri til scoring. Beholder rekkefølgen i `list`.
 */
function aliveAmong(list: string[], results: MatchResult[]): string[] {
  const set = new Set(list);
  const alive = new Set<string>();
  for (const m of results) {
    if (m.status === 'FINISHED') continue;
    for (const team of [m.homeTeam, m.awayTeam]) {
      if (team && team !== 'TBD' && set.has(team)) alive.add(team);
    }
  }
  return list.filter((t) => alive.has(t));
}

/** Lagets lengste runde + den avgjørende kampdagen. */
function furthestStageOf(team: string, results: MatchResult[]): { stage: Stage; day: string } | null {
  let bestRank = -1;
  let res: { stage: Stage; day: string } | null = null;
  for (const m of results) {
    const rank = STAGE_RANK[m.stage];
    if (rank == null || (m.homeTeam !== team && m.awayTeam !== team)) continue;
    const day = matchDayKey(m.utcDate);
    if (rank > bestRank || (rank === bestRank && res && day > res.day)) {
      bestRank = rank;
      res = { stage: m.stage, day };
    }
  }
  return res;
}

/** Noon-ISO for en kamps matchday (samme 12:00-grense som grafen/pilene). */
const noon = (utcDate: string) => `${matchDayKey(utcDate)}T12:00:00.000Z`;

/** Etternavn for å øke treff mot deltakernes svar (de skriver ofte bare etternavn). */
function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : full;
}

/**
 * Datoen (noon-ISO) da alle tre Bodø/Glimt-spillerne hadde spilt – dvs. kampdagen der den SISTE
 * av de tre debuterte (maks av tidligste-spilte-dato per spiller). Mater q16 sin `at` så chipen
 * dateres til Norges kamp i breakdown/graf i stedet for «siste kampdag». `null` hvis vi mangler
 * dato for en av dem (eldre stats-cache uten datoer).
 */
function glimtAllPlayedIso(stats: StatsData): string | null {
  const at = stats.playedAt ?? {};
  const ds = GLIMT_IDS.map((id) => at[id]).filter((d): d is string => typeof d === 'string');
  if (ds.length < GLIMT_IDS.length) return null;
  return ds.reduce((a, b) => (a > b ? a : b));
}

/** Seneste matchday-dato blant kampene (for «avgjort»-datoen). */
function latestDay(matches: MatchResult[]): string {
  return matches.reduce((d, m) => {
    const k = matchDayKey(m.utcDate);
    return k > d ? k : d;
  }, '');
}

// --- R32-kamp-spørsmål (q18 mest målrik, q19 flest gule kort) ---
const r32Of = (results: MatchResult[]) => results.filter((m) => m.stage === 'ROUND_OF_32');
// Mål i spill (inkl. ekstraomganger, ekskl. straffekonk) – straffemål skal aldri telle for q18.
const goalsOf = (m: MatchResult) => {
  const g = playGoals(m);
  return g.home + g.away;
};
/** Kanonisk «Hjemme - Borte»-navn (norske lagnavn). */
const matchName = (m: MatchResult) => `${normalizeTeamName(m.homeTeam)} - ${normalizeTeamName(m.awayTeam)}`;
/** Kamp(er) med høyest `val` (likhet på toppen → flere). Tom liste hvis maks ≤ 0. */
function topMatches(matches: MatchResult[], val: (m: MatchResult) => number): string[] {
  if (matches.length === 0) return [];
  const max = Math.max(...matches.map(val));
  if (max <= 0) return [];
  return matches.filter((m) => val(m) === max).map(matchName);
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

  // q1: VM-vinner – når finalen er ferdig. Bruker API-ets `winner` (riktig også når finalen
  // avgjøres på ekstraomganger eller straffer, der 90-min-resultatet er uavgjort).
  const final = results.find((m) => m.stage === 'FINAL');
  if (
    final &&
    final.status === 'FINISHED' &&
    (final.winner === 'HOME_TEAM' || final.winner === 'AWAY_TEAM')
  ) {
    const winner = final.winner === 'HOME_TEAM' ? final.homeTeam : final.awayTeam;
    store.q1 = { answer: normalizeTeamName(winner), at: noon(final.utcDate) };
  }

  // q5: antall mål totalt – når ALLE kamper er ferdige. Teller spille-mål (inkl. ekstraomganger,
  // ekskl. straffekonk) via playGoals/goalsOf.
  if (results.every((m) => m.status === 'FINISHED')) {
    const total = results.reduce((s, m) => s + goalsOf(m), 0);
    store.q5 = { answer: String(total), at: `${latestDay(results)}T12:00:00.000Z` };
  }

  // q9 + q10: avgjøres når gruppespillet er ferdig.
  const group = results.filter((m) => m.stage === 'GROUP_STAGE');
  if (group.length > 0 && group.every((m) => m.status === 'FINISHED')) {
    const groupDay = `${latestDay(group)}T12:00:00.000Z`;
    // q9: gruppe(r) med flest mål – likt på toppen → alle (gruppe-bokstav-matching i scoringen).
    const leaders = groupGoalLeaders(results);
    if (leaders && leaders.leaders.length > 0) {
      store.q9 = { answer: leaders.leaders, at: groupDay };
    }
    // q10: dårligste lag.
    const worst = worstTeamSoFar(results);
    if (worst) {
      store.q10 = { answer: normalizeTeamName(worst.team), at: groupDay };
    }
  }

  // q18: mest målrik R32-kamp – låses når alle sekstendelsfinaler er ferdige (likt → flere gjelder).
  const r32 = r32Of(results);
  if (r32.length > 0 && r32.every((m) => m.status === 'FINISHED')) {
    const top = topMatches(r32, goalsOf);
    if (top.length) {
      store.q18 = { answer: top.length === 1 ? top[0] : top, at: `${latestDay(r32)}T12:00:00.000Z` };
    }
  }

  // q12/q14/q17: «kommer lengst» – avgjøres ved turneringsslutt (finalen ferdig), så vi aldri
  // låser på et lag som fortsatt kan komme lenger. Likt på toppen → alle (q12/q14).
  if (final && final.status === 'FINISHED') {
    const isl = furthestAmong(ISLAND_NATIONS, results);
    if (isl) store.q12 = { answer: isl.teams.map(normalizeTeamName), at: `${isl.day}T12:00:00.000Z` };
    const afr = furthestAmong(AFRICAN_NATIONS, results);
    if (afr) store.q14 = { answer: afr.teams.map(normalizeTeamName), at: `${afr.day}T12:00:00.000Z` };
    const nor = furthestStageOf('Norway', results);
    if (nor) store.q17 = { answer: STAGE_LABELS[nor.stage], at: `${nor.day}T12:00:00.000Z` };
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
  if (all3) store.q16 = { answer: 'Ja', at: glimtAllPlayedIso(stats) ?? endIso };
  else if (over) store.q16 = { answer: 'Nei', at: endIso };

  // q19: R32-kamp med flest gule kort – låses når alle sekstendelsfinaler er ferdige.
  const r32 = r32Of(results);
  if (r32.length > 0 && r32.every((m) => m.status === 'FINISHED') && stats.matchYellows) {
    const yel = (m: MatchResult) => stats.matchYellows![m.apiId] ?? 0;
    const top = topMatches(r32, yel);
    if (top.length) {
      store.q19 = { answer: top.length === 1 ? top[0] : top, at: `${latestDay(r32)}T12:00:00.000Z` };
    }
  }

  return store;
}

/**
 * Foreløpige auto-verdier KUN for visning (read-only «Auto nå»-hint i admin) – «slik ligger det
 * an akkurat nå». Scorer ALDRI; vises for spørsmål som ennå ikke er avgjort, men der API-et har en
 * pekepinn. Brukes bare når et spørsmål ikke alt er låst av deriveDecidedBonus/deriveStatsBonus.
 */
export function derivePreliminaryBonus(
  stats: StatsData | null,
  results: MatchResult[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (results.length === 0) return out;

  // q5: antall mål så langt + live-projeksjon (mål-per-kamp × 104).
  const proj = projectTotalGoals(results);
  if (proj && proj.goalsSoFar > 0) {
    out.q5 = `${proj.goalsSoFar} mål så langt (projeksjon: ${proj.projected})`;
  }

  // q9: gruppe(r) med flest mål så langt.
  const leaders = groupGoalLeaders(results);
  if (leaders && leaders.leaders.length > 0) out.q9 = leaders.leaders.join(', ');

  // q10: dårligste lag så langt.
  const worst = worstTeamSoFar(results);
  if (worst) out.q10 = normalizeTeamName(worst.team);

  // q12/q14: lengst-kommende øynasjon / afrikanske land så langt.
  const isl = furthestAmong(ISLAND_NATIONS, results);
  if (isl) out.q12 = isl.teams.map(normalizeTeamName).join(', ');
  const afr = furthestAmong(AFRICAN_NATIONS, results);
  if (afr) out.q14 = afr.teams.map(normalizeTeamName).join(', ');

  // q17: hvor langt Norge har kommet så langt.
  const nor = furthestStageOf('Norway', results);
  if (nor) out.q17 = STAGE_LABELS[nor.stage];

  // q18: mest målrik R32-kamp så langt.
  const r32 = r32Of(results);
  const topGoals = topMatches(r32, goalsOf);
  if (topGoals.length) out.q18 = `${topGoals.join(', ')} (${Math.max(...r32.map(goalsOf))} mål)`;

  if (stats) {
    // q19: R32-kamp med flest gule kort så langt.
    if (stats.matchYellows) {
      const yel = (m: MatchResult) => stats.matchYellows![m.apiId] ?? 0;
      const topY = topMatches(r32, yel);
      if (topY.length) out.q19 = `${topY.join(', ')} (${Math.max(...r32.map(yel))} gule)`;
    }

    // q3: toppscorer så langt – alle som deler ledelsen (likt antall mål).
    if (stats.topScorers && stats.topScorers.length > 0) {
      const max = stats.topScorers[0].goals ?? 0;
      if (max > 0) {
        const names = stats.topScorers.filter((p) => (p.goals ?? 0) === max).map((p) => p.name);
        out.q3 = `${names.join(', ')} (${max} mål)`;
      }
    }

    // q6: raskeste mål så langt (API kjenner kun minuttet, ikke sekundet → flere kan dele
    // det laveste minuttet). Viser «minutt' (Spiller – Lag, …)».
    const fastest =
      stats.fastestGoals && stats.fastestGoals.length > 0
        ? stats.fastestGoals
        : stats.fastestGoal
          ? [stats.fastestGoal]
          : [];
    if (fastest.length > 0) {
      const who = fastest
        .map((g) => `${g.scorer}${g.team ? ` – ${normalizeTeamName(g.team)}` : ''}`)
        .join(', ');
      out.q6 = `${fastest[0].minute}' (${who})`;
    }

    // q13: flest mål av Ronaldo/Messi så langt.
    const r = stats.goalsByPlayer?.[RONALDO_ID] ?? 0;
    const m = stats.goalsByPlayer?.[MESSI_ID] ?? 0;
    out.q13 = `Ronaldo ${r} – ${m} Messi`;

    // q16: hvor mange av de tre Glimt-spillerne som har spilt (når ikke alle tre ennå).
    const played = new Set(stats.playedIds ?? []);
    const n = GLIMT_IDS.filter((id) => played.has(id)).length;
    if (n < 3) out.q16 = `Nei (${n} av 3 har spilt)`;
  }

  return out;
}

/**
 * Foreløpig fasit i **scorbar** form (svar-verdier, ikke display-strenger) for spørsmål som ennå
 * ikke er avgjort – KUN til **visuell** fargekoding av tips-chips i Krydder. Scorer ALDRI i tabellen
 * (mates ikke inn i `bonusMerged`). Samme svar-verdier som de avgjorte derivasjonene, men ungated.
 * Utelater q5/q9/q10 (har egne live-indikatorer) og q6/q7/q8 (egen håndtering).
 */
export function deriveProvisionalAnswers(
  stats: StatsData | null,
  results: MatchResult[],
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (results.length === 0) return out;

  // q12/q14: ALLE øynasjoner/afrikanske land som fortsatt kan gå videre (gul = teoretisk med).
  // Bevisst IKKE «lengst så langt» – vi vil aldri farge grønt før vinneren faktisk er avgjort.
  const islAlive = aliveAmong(ISLAND_NATIONS, results);
  if (islAlive.length) out.q12 = islAlive.map(normalizeTeamName);
  const afrAlive = aliveAmong(AFRICAN_NATIONS, results);
  if (afrAlive.length) out.q14 = afrAlive.map(normalizeTeamName);
  // q17: hvor langt Norge har kommet så langt.
  const nor = furthestStageOf('Norway', results);
  if (nor) out.q17 = STAGE_LABELS[nor.stage];

  // q18: mest målrik R32-kamp så langt (kamp-navn; scoringen matcher lag-par).
  const topGoals = topMatches(r32Of(results), goalsOf);
  if (topGoals.length) out.q18 = topGoals;

  if (stats) {
    // q19: R32-kamp med flest gule kort så langt.
    if (stats.matchYellows) {
      const yel = (m: MatchResult) => stats.matchYellows![m.apiId] ?? 0;
      const topY = topMatches(r32Of(results), yel);
      if (topY.length) out.q19 = topY;
    }

    // q3: toppscorer(e) så langt (alle som deler ledelsen; inkluder etternavn for treff).
    if (stats.topScorers && stats.topScorers.length > 0) {
      const max = stats.topScorers[0].goals ?? 0;
      if (max > 0) {
        const names = stats.topScorers.filter((p) => (p.goals ?? 0) === max);
        out.q3 = [...new Set(names.flatMap((p) => [p.name, lastName(p.name)]))];
      }
    }
    // q13: Ronaldo/Messi-leder så langt (likt → begge).
    const r = stats.goalsByPlayer?.[RONALDO_ID] ?? 0;
    const m = stats.goalsByPlayer?.[MESSI_ID] ?? 0;
    const a13: string[] = [];
    if (r >= m) a13.push('Ronaldo', 'Cristiano Ronaldo');
    if (m >= r) a13.push('Messi', 'Lionel Messi');
    out.q13 = a13;
    // q16: Glimt-spilletid så langt.
    const played = new Set(stats.playedIds ?? []);
    out.q16 = GLIMT_IDS.every((id) => played.has(id)) ? 'Ja' : 'Nei';
  }

  return out;
}
