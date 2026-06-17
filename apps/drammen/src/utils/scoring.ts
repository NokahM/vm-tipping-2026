import type {
  BonusQuestion,
  BonusTip,
  GroupTip,
  KnockoutTip,
  MatchResult,
  Outcome,
  Participant,
  ParticipantScore,
  Stage,
} from '../types';
import { normalizeTeamName } from './teamNames';
import { spellKey } from './teamCanon';

// ---------------------------------------------------------------------------
// Kjernepoeng: 3 = eksakt resultat, 1 = riktig utfall, 0 = feil.
// ---------------------------------------------------------------------------

export function getOutcome(home: number, away: number): Outcome {
  if (home > away) return 'home';
  if (home === away) return 'draw';
  return 'away';
}

export function calcPoints(
  tipHome: number,
  tipAway: number,
  resultHome: number,
  resultAway: number,
): number {
  if (tipHome === resultHome && tipAway === resultAway) return 3;
  if (getOutcome(tipHome, tipAway) === getOutcome(resultHome, resultAway)) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Matching av tips mot ferdige resultater.
// Gruppespill matches på normalisert hjemmelag|bortelag|gruppe.
// Sluttspill matches på apiId.
// ---------------------------------------------------------------------------

export type Goals = { home: number; away: number };

function isPlayed(r: MatchResult): r is MatchResult & { homeGoals: number; awayGoals: number } {
  return r.status === 'FINISHED' && r.homeGoals !== null && r.awayGoals !== null;
}

function groupKey(home: string, away: string, group: string): string {
  return `${home}|${away}|${group}`;
}

/** Bygger oppslag for gruppespill-resultater, nøklet på norske lagnavn + gruppe. */
export function buildGroupResultIndex(results: MatchResult[]): Map<string, Goals> {
  const idx = new Map<string, Goals>();
  for (const r of results) {
    if (!isPlayed(r) || !r.group) continue;
    const home = normalizeTeamName(r.homeTeam);
    const away = normalizeTeamName(r.awayTeam);
    idx.set(groupKey(home, away, r.group), { home: r.homeGoals, away: r.awayGoals });
  }
  return idx;
}

/** Bygger oppslag for sluttspill-resultater, nøklet på apiId. */
export function buildKnockoutResultIndex(results: MatchResult[]): Map<number, Goals> {
  const idx = new Map<number, Goals>();
  for (const r of results) {
    if (!isPlayed(r)) continue;
    idx.set(r.apiId, { home: r.homeGoals, away: r.awayGoals });
  }
  return idx;
}

interface MatchScore {
  points: number;
  correctResults: number; // antall 3-poengere
  correctOutcomes: number; // antall 1-poengere
  wrongOutcomes: number; // antall 0-poengere (kun spilte kamper med tip)
}

function emptyScore(): MatchScore {
  return { points: 0, correctResults: 0, correctOutcomes: 0, wrongOutcomes: 0 };
}

function accumulate(score: MatchScore, points: number): void {
  score.points += points;
  if (points === 3) score.correctResults += 1;
  else if (points === 1) score.correctOutcomes += 1;
  else score.wrongOutcomes += 1;
}

function scoreGroupTips(tips: GroupTip[], idx: Map<string, Goals>): MatchScore {
  const score = emptyScore();
  for (const t of tips) {
    const res = idx.get(groupKey(t.homeTeam, t.awayTeam, t.group));
    if (!res) continue;
    accumulate(score, calcPoints(t.homeGoals, t.awayGoals, res.home, res.away));
  }
  return score;
}

function scoreKnockoutTips(tips: KnockoutTip[], idx: Map<number, Goals>): MatchScore {
  const score = emptyScore();
  for (const t of tips) {
    const res = idx.get(t.apiId);
    if (!res) continue;
    accumulate(score, calcPoints(t.homeGoals, t.awayGoals, res.home, res.away));
  }
  return score;
}

// ---------------------------------------------------------------------------
// Krydderspørsmål. Poeng beregnes kun for spørsmål med satt fasit (answer != null).
// ---------------------------------------------------------------------------

// Diakritisk-insensitiv + feilstavings-tolerant, så åpenbare feilstavinger (Curacau → Curaçao,
// Mbappe → Mbappé) gir riktig poeng. Brukes for all tekst-matching av krydder-svar.
function norm(s: string): string {
  return spellKey(s);
}

/** Gruppe-bokstaver (A–L) som står alene i et q9-svar, f.eks. «Gruppe I og L» → [I, L]. */
export function groupLetters(text: string): string[] {
  return text.toUpperCase().match(/\b[A-L]\b/g) ?? [];
}

/** Tolker fritekst-runde (q17) → Stage. Nøkkelord-basert, robust mot variasjon.
 *  Spesifikke runder sjekkes FØR bare «finale», ellers fanges «åttendelsfinale» feil. */
export function parseStage(text: string): Stage | null {
  const t = text.toLowerCase();
  if (/gruppe/.test(t)) return 'GROUP_STAGE';
  if (/sekstendel|16-?del/.test(t)) return 'ROUND_OF_32';
  if (/åttendel|åttedel|attendel|8-?del/.test(t)) return 'ROUND_OF_16'; // inkl. skrivefeil «åttedel»
  if (/kvart/.test(t)) return 'QUARTER_FINALS';
  if (/semi/.test(t)) return 'SEMI_FINALS';
  if (/bronse|tredjeplass|3\.?\s*plass/.test(t)) return 'THIRD_PLACE';
  if (/finale/.test(t)) return 'FINAL'; // bare igjen for ren «finale»
  return null;
}

function firstNumber(s: string): number {
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : NaN;
}

/** "mm:ss" eller "hh:mm:ss" → sekunder. */
function timeToSeconds(s: string): number | null {
  const parts = s.match(/\d+/g);
  if (!parts || parts.length < 2) return null;
  const nums = parts.map(Number);
  return nums.length >= 3
    ? nums[0] * 3600 + nums[1] * 60 + nums[2]
    : nums[0] * 60 + nums[1];
}

function bonusAnswerOf(tip: BonusTip): string[] {
  return Array.isArray(tip.answer) ? tip.answer : [tip.answer];
}

// Liste-fasit-spørsmål der deltakeren nevner FLERE og får poeng per korrekt (maxPoints/2 per lag).
// Andre liste-fasit-spørsmål (f.eks. q15 kjendis) gir full pott hvis deltakerens ene svar er i lista.
const PER_TEAM_IDS = new Set(['q7', 'q8']);

// q5 (antall mål totalt): full pott til ALLE som er innenfor ±5 mål av fasit.
const GOAL_MARGIN = 5;

/**
 * Krydderpoeng for ett spørsmål, for alle deltakere (navn → poeng).
 * Alle får 0 hvis fasit ikke er satt. q5 «nærmest» krever hele feltet samtidig.
 */
export function scoreBonusQuestion(
  participants: Participant[],
  q: BonusQuestion,
): Map<string, number> {
  const points = new Map<string, number>(participants.map((p) => [p.name, 0]));
  if (q.answer === null) return points;

  const add = (name: string, p: number) => points.set(name, (points.get(name) ?? 0) + p);
  const tipFor = (p: Participant) => p.bonusTips.find((t) => t.questionId === q.id);

  if (q.id === 'q5') {
    // Antall mål totalt: full pott til alle innenfor ±GOAL_MARGIN mål av fasit.
    const fasit = firstNumber(String(q.answer));
    if (Number.isNaN(fasit)) return points;
    for (const p of participants) {
      const tip = tipFor(p);
      if (!tip) continue;
      const guess = firstNumber(bonusAnswerOf(tip)[0] ?? '');
      if (!Number.isNaN(guess) && Math.abs(guess - fasit) <= GOAL_MARGIN) add(p.name, q.maxPoints);
    }
    return points;
  }

  if (q.id === 'q6') {
    // Raskeste mål: innenfor ±15 sekunder fra fasit.
    const fasit = timeToSeconds(String(q.answer));
    if (fasit === null) return points;
    for (const p of participants) {
      const tip = tipFor(p);
      if (!tip) continue;
      const guess = timeToSeconds(bonusAnswerOf(tip)[0] ?? '');
      if (guess !== null && Math.abs(guess - fasit) <= 15) add(p.name, q.maxPoints);
    }
    return points;
  }

  if (q.id === 'q9') {
    // Gruppe flest mål: sammenlign gruppe-bokstaver (robust mot «I» / «Gruppe I» / «gruppe i»).
    // Fasit kan være flere bokstaver (uavgjort på toppen → poeng til alle som tippet en av dem).
    const fasitLetters = new Set(
      groupLetters(Array.isArray(q.answer) ? q.answer.join(' ') : String(q.answer)),
    );
    if (fasitLetters.size === 0) return points;
    for (const p of participants) {
      const tip = tipFor(p);
      if (!tip) continue;
      const ans = groupLetters(bonusAnswerOf(tip)[0] ?? '');
      if (ans.some((l) => fasitLetters.has(l))) add(p.name, q.maxPoints);
    }
    return points;
  }

  if (q.id === 'q17') {
    // Hvor langt kommer Norge: sammenlign tolket runde (robust mot «kvartfinale» / «kvart» / «QF»).
    // Blankt / «–» = IKKE svart (gir ingen poeng) – deltakerne kan svare frem til Norges gruppestart.
    const fasitStage = parseStage(String(q.answer));
    if (!fasitStage) return points;
    for (const p of participants) {
      const tip = tipFor(p);
      if (!tip) continue;
      if (parseStage(bonusAnswerOf(tip)[0] ?? '') === fasitStage) add(p.name, q.maxPoints);
    }
    return points;
  }

  if (Array.isArray(q.answer)) {
    const actual = new Set(q.answer.map(norm));
    if (PER_TEAM_IDS.has(q.id)) {
      // q7/q8: deltakerne nevner 2 lag, hvert korrekt lag er verdt maxPoints/2 (begge nå 2p, maks 4).
      const perTeam = q.maxPoints / 2;
      for (const p of participants) {
        const tip = tipFor(p);
        if (!tip) continue;
        const hits = bonusAnswerOf(tip).filter((a) => actual.has(norm(a))).length;
        if (hits > 0) add(p.name, Math.min(hits * perTeam, q.maxPoints));
      }
    } else {
      // Liste-fasit med ett tip (q15 kjendis): full pott hvis deltakerens svar er i lista.
      for (const p of participants) {
        const tip = tipFor(p);
        if (!tip) continue;
        if (bonusAnswerOf(tip).some((a) => actual.has(norm(a)))) add(p.name, q.maxPoints);
      }
    }
    return points;
  }

  // Standard: eksakt tekstmatch (case-insensitivt) → maxPoints.
  const fasit = norm(String(q.answer));
  for (const p of participants) {
    const tip = tipFor(p);
    if (!tip) continue;
    if (norm(bonusAnswerOf(tip)[0] ?? '') === fasit) add(p.name, q.maxPoints);
  }
  return points;
}

/** Summerer krydderpoeng over alle spørsmål: navn → total. */
export function computeBonusPoints(
  participants: Participant[],
  questions: BonusQuestion[],
): Map<string, number> {
  const total = new Map<string, number>(participants.map((p) => [p.name, 0]));
  for (const q of questions) {
    for (const [name, pts] of scoreBonusQuestion(participants, q)) {
      total.set(name, (total.get(name) ?? 0) + pts);
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Totalstilling.
// ---------------------------------------------------------------------------

export function computeStandings(
  participants: Participant[],
  results: MatchResult[],
  questions: BonusQuestion[],
): ParticipantScore[] {
  const groupIdx = buildGroupResultIndex(results);
  const knockoutIdx = buildKnockoutResultIndex(results);
  const bonus = computeBonusPoints(participants, questions);

  const scored: ParticipantScore[] = participants.map((p) => {
    const g = scoreGroupTips(p.groupTips, groupIdx);
    const k = scoreKnockoutTips(p.knockoutTips, knockoutIdx);
    const bonusPoints = bonus.get(p.name) ?? 0;
    return {
      name: p.name,
      groupPoints: g.points,
      knockoutPoints: k.points,
      bonusPoints,
      total: g.points + k.points + bonusPoints,
      correctResults: g.correctResults + k.correctResults,
      correctOutcomes: g.correctOutcomes + k.correctOutcomes,
      wrongOutcomes: g.wrongOutcomes + k.wrongOutcomes,
      rank: 0,
    };
  });

  // Sorter på total, så flest eksakte resultater, så navn (stabil visning).
  scored.sort(
    (a, b) =>
      b.total - a.total ||
      b.correctResults - a.correctResults ||
      a.name.localeCompare(b.name, 'no'),
  );

  // Rang: lik totalsum deler plassering (1, 2, 2, 4 …).
  let lastTotal: number | null = null;
  let lastRank = 0;
  scored.forEach((s, i) => {
    if (s.total !== lastTotal) {
      lastRank = i + 1;
      lastTotal = s.total;
    }
    s.rank = lastRank;
  });

  return scored;
}

// ---------------------------------------------------------------------------
// UI-hjelpere: finn en deltakers tip for en kamp, og poeng for et tip.
// ---------------------------------------------------------------------------

/** Finner en deltakers tip for en konkret kamp (gruppespill via navn, sluttspill via apiId). */
export function tipForMatch(p: Participant, match: MatchResult): Goals | null {
  if (match.stage === 'GROUP_STAGE' && match.group) {
    const home = normalizeTeamName(match.homeTeam);
    const away = normalizeTeamName(match.awayTeam);
    const t = p.groupTips.find(
      (g) => g.homeTeam === home && g.awayTeam === away && g.group === match.group,
    );
    return t ? { home: t.homeGoals, away: t.awayGoals } : null;
  }
  const k = p.knockoutTips.find((t) => t.apiId === match.apiId);
  return k ? { home: k.homeGoals, away: k.awayGoals } : null;
}

/** Poeng for et tip mot en kamp. null hvis kampen ikke er ferdigspilt. */
export function pointsForTip(tip: Goals, match: MatchResult): number | null {
  if (!isPlayed(match)) return null;
  return calcPoints(tip.home, tip.away, match.homeGoals, match.awayGoals);
}

export interface GoalProjection {
  goalsSoFar: number; // mål i ferdige + pågående kamper
  matchesCounted: number; // antall kamper som har startet (ferdige + live)
  totalMatches: number; // totalt antall kamper i VM (104)
  projected: number; // ekstrapolert totalt antall mål
}

/**
 * Live-projeksjon av totalt antall mål i hele VM, basert på mål-per-kamp så langt
 * (ferdige + pågående kamper, inkl. ekstraomganger via score.fullTime). Brukes KUN til
 * visuell projeksjon/fargekoding av q5 – påvirker ikke poeng (q5 scores mot faktisk
 * fasit når VM er ferdig).
 */
export function projectTotalGoals(results: MatchResult[]): GoalProjection | null {
  let goalsSoFar = 0;
  let matchesCounted = 0;
  for (const m of results) {
    const started =
      m.status === 'FINISHED' || m.status === 'IN_PLAY' || m.status === 'PAUSED';
    if (!started || m.homeGoals === null || m.awayGoals === null) continue;
    goalsSoFar += m.homeGoals + m.awayGoals;
    matchesCounted += 1;
  }
  if (matchesCounted === 0) return null;
  const totalMatches = results.length || matchesCounted;
  const projected = Math.round((goalsSoFar / matchesCounted) * totalMatches);
  return { goalsSoFar, matchesCounted, totalMatches, projected };
}

export interface GroupGoalStanding {
  goalsByGroup: Record<string, number>; // gruppe-bokstav (A–L) → mål så langt
  leaders: string[]; // gruppe(r) med flest mål nå (kan være flere ved likt)
  topGoals: number;
}

/**
 * Live-status for «hvilken gruppe scorer flest mål?» (q9): mål per gruppe så langt
 * (ferdige + pågående gruppespill-kamper), og hvem som leder nå. Kun visuelt – q9
 * scores mot faktisk fasit. Returnerer null før noen gruppemål er scoret.
 */
export function groupGoalLeaders(results: MatchResult[]): GroupGoalStanding | null {
  const goalsByGroup: Record<string, number> = {};
  for (const m of results) {
    if (m.stage !== 'GROUP_STAGE' || !m.group) continue;
    const started = m.status === 'FINISHED' || m.status === 'IN_PLAY' || m.status === 'PAUSED';
    if (!started || m.homeGoals === null || m.awayGoals === null) continue;
    const letter = m.group.replace('GROUP_', '');
    goalsByGroup[letter] = (goalsByGroup[letter] ?? 0) + m.homeGoals + m.awayGoals;
  }
  const entries = Object.entries(goalsByGroup);
  if (entries.length === 0) return null;
  const topGoals = Math.max(...entries.map(([, g]) => g));
  const leaders = entries
    .filter(([, g]) => g === topGoals)
    .map(([k]) => k)
    .sort();
  return { goalsByGroup, leaders, topGoals };
}

/**
 * Som pointsForTip, men gir også FORELØPIGE poeng mens en kamp pågår (live-stilling).
 * Brukes KUN til visuell fargekoding i kamp-tips – påvirker ikke tabellen/standings,
 * som fortsatt teller utelukkende ferdigspilte kamper.
 */
export function displayPointsForTip(tip: Goals, match: MatchResult): number | null {
  const started =
    match.status === 'FINISHED' || match.status === 'IN_PLAY' || match.status === 'PAUSED';
  if (!started || match.homeGoals === null || match.awayGoals === null) return null;
  return calcPoints(tip.home, tip.away, match.homeGoals, match.awayGoals);
}

export type ScoringItem = { date?: string } & (
  | { kind: 'match'; home: string; away: string; result: string; points: number }
  | { kind: 'bonus'; question: string; answer: string; points: number }
);

/** Avgjort-datoer for krydder (samme form som progression's BonusDateInfo). */
type BonusDates = Record<string, { at?: string; ats?: Record<string, string> }>;

/**
 * Alle kildene der en deltaker faktisk har FÅTT poeng (kamper og krydder).
 * Bomtipp (0 poeng) tas ikke med. Kamper får sin matchday-dato, krydder sin avgjort-dato
 * (`bonusInfo`); når `bonusInfo` er gitt sorteres alt **kronologisk** (kamp + krydder om
 * hverandre). Uten `bonusInfo` beholdes gammel rekkefølge (kamper kronologisk, krydder til slutt).
 */
export function participantBreakdown(
  participant: Participant,
  participants: Participant[],
  results: MatchResult[],
  questions: BonusQuestion[],
  bonusInfo?: BonusDates,
): ScoringItem[] {
  // Hver kilde får en sorteringsnøkkel `${matchday}#${innen-dag}` så krydder kan flettes
  // kronologisk blant kampene (kun når `bonusInfo` er gitt). `innen-dag` = kampens utcDate for
  // kamper og for krydder knyttet til en kamp (→ rett etter den kampen); ellers «ZZZ» (dagens slutt).
  const rows: { key: string; item: ScoringItem }[] = [];

  const played = results.filter(isPlayed).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  const matchDays = [...new Set(played.map((m) => matchDayKey(m.utcDate)))].sort();
  const fallbackDay = matchDays.length
    ? matchDays[matchDays.length - 1]
    : matchDayKey(new Date().toISOString());

  for (const m of played) {
    const tip = tipForMatch(participant, m);
    if (!tip) continue;
    const pts = calcPoints(tip.home, tip.away, m.homeGoals, m.awayGoals);
    if (pts <= 0) continue;
    const day = matchDayKey(m.utcDate);
    rows.push({
      key: `${day}#${m.utcDate}`,
      item: {
        kind: 'match',
        home: normalizeTeamName(m.homeTeam),
        away: normalizeTeamName(m.awayTeam),
        result: `${m.homeGoals}–${m.awayGoals}`,
        points: pts,
        date: day,
      },
    });
  }

  // Avgjort-matchday for krydder. For liste-spørsmål brukes DETTE deltakerens treff-element(er)
  // – ikke tidligste element globalt. Enkelt-svar → `at`; udatert → siste matchday.
  const decidedDay = (q: BonusQuestion, relevant: string[] | null): string => {
    const info = bonusInfo?.[q.id];
    if (!info) return fallbackDay;
    let raw: string | undefined;
    if (relevant && relevant.length && info.ats) {
      const ds = relevant.map((it) => info.ats![it]).filter((d): d is string => !!d);
      if (ds.length) raw = ds.reduce((a, b) => (a < b ? a : b));
    }
    if (!raw) {
      const atsVals = info.ats ? Object.values(info.ats) : [];
      raw = atsVals.length ? atsVals.reduce((a, b) => (a < b ? a : b)) : info.at;
    }
    return raw ? matchDayKey(raw) : fallbackDay;
  };
  // utcDate for lagets kamp den dagen (→ krydder-chip rett etter kampen); ellers dagens slutt.
  const withinDay = (day: string, team?: string): string => {
    if (team) {
      const m = played.find(
        (mm) =>
          matchDayKey(mm.utcDate) === day &&
          (norm(normalizeTeamName(mm.homeTeam)) === norm(team) ||
            norm(normalizeTeamName(mm.awayTeam)) === norm(team)),
      );
      if (m) return m.utcDate;
    }
    return 'ZZZ';
  };

  for (const q of questions) {
    if (q.answer === null) continue;
    const pts = scoreBonusQuestion(participants, q).get(participant.name) ?? 0;
    if (pts <= 0) continue;
    const tip = participant.bonusTips.find((t) => t.questionId === q.id);

    // q7/q8 i kronologisk modus: én chip per nevnt lag, hver rett etter sin egen kamp.
    if (bonusInfo && tip && PER_TEAM_IDS.has(q.id) && Array.isArray(q.answer)) {
      const mine = new Set(bonusAnswerOf(tip).map(norm));
      const relevant = q.answer.filter((ae) => mine.has(norm(ae)));
      const perTeam = q.maxPoints / 2;
      for (const team of relevant) {
        const day = decidedDay(q, [team]);
        rows.push({
          key: `${day}#${withinDay(day, team)}`,
          item: { kind: 'bonus', question: q.question, answer: team, points: perTeam, date: day },
        });
      }
      continue;
    }

    // Kombinert chip (ingen bonusInfo, eller ikke-per-lag spørsmål).
    let answer = tip ? (Array.isArray(tip.answer) ? tip.answer.join(' + ') : tip.answer) : '';
    let relevant: string[] | null = null;
    if (tip && Array.isArray(q.answer)) {
      const mine = new Set(bonusAnswerOf(tip).map(norm));
      relevant = q.answer.filter((ae) => mine.has(norm(ae)));
      if (PER_TEAM_IDS.has(q.id) && relevant.length) answer = relevant.join(' + ');
    }
    const day = decidedDay(q, relevant);
    rows.push({ key: `${day}#ZZZ`, item: { kind: 'bonus', question: q.question, answer, points: pts, date: day } });
  }

  // Kronologisk fletting kun når vi har krydder-datoer (ellers: kamper først, krydder sist).
  // Stabil sort: krydder knyttet til en kamp (lik nøkkel) havner rett etter kampen.
  if (bonusInfo) rows.sort((a, b) => a.key.localeCompare(b.key));

  return rows.map((r) => r.item);
}

// Grensen mellom «kampdager» settes til 10:00 UTC = 12:00 norsk sommertid – midt i det
// daglige kampfrie vinduet. Da havner en hel runde (som for VM 2026 i Nord-Amerika strekker
// seg over midnatt europeisk tid) i samme pulje. Vi forskyver tidspunktet 10 timer tilbake
// før vi tar datoen, så grensen faller på 10:00 UTC i stedet for 00:00 UTC.
const MATCHDAY_BOUNDARY_MS = 10 * 60 * 60 * 1000;
export function matchDayKey(utcDate: string): string {
  return new Date(Date.parse(utcDate) - MATCHDAY_BOUNDARY_MS).toISOString().slice(0, 10);
}

/**
 * Plasseringsendring etter siste kampdag: navn → delta (positiv = opp, negativ =
 * ned, 0 = uendret). «Siste kampdag» = alle ferdige kamper i den seneste runden, der en
 * runde avgrenses ved 10:00 UTC / 12:00 norsk (samtidige kamper og hele rundens kamper –
 * inkl. de som krysser midnatt – teller som én hendelse). Sammenligner nåværende tabell mot
 * tabellen før den rundens resultater.
 */
export function computeRankDeltas(
  current: ParticipantScore[],
  participants: Participant[],
  results: MatchResult[],
  questions: BonusQuestion[],
): Map<string, number> {
  const deltas = new Map<string, number>();

  const finished = results.filter(isPlayed);
  if (finished.length === 0) return deltas; // ingen resultater ennå → ingen bevegelse

  let lastDay = '';
  for (const m of finished) {
    const day = matchDayKey(m.utcDate);
    if (day > lastDay) lastDay = day;
  }
  const lastBatch = new Set(
    finished.filter((m) => matchDayKey(m.utcDate) === lastDay).map((m) => m.apiId),
  );

  const prevResults = results.filter((m) => !lastBatch.has(m.apiId));
  const previous = computeStandings(participants, prevResults, questions);
  const prevRank = new Map(previous.map((s) => [s.name, s.rank]));

  for (const s of current) {
    const before = prevRank.get(s.name) ?? s.rank;
    deltas.set(s.name, before - s.rank); // lavere rank = bedre → positiv = opp
  }
  return deltas;
}
