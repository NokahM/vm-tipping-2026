/**
 * Verifiserer scoring + matching mot kjente resultater.
 * Kjør fra repo-roten:  npx tsx tools/verify_scoring.ts
 * (legger ingen avhengighet i package.json – npx henter tsx midlertidig)
 */
import { PARTICIPANTS } from '../apps/drammen/src/data/participants';
import { BONUS_QUESTIONS } from '../apps/drammen/src/data/bonusQuestions';
import {
  calcPoints,
  computeRankDeltas,
  computeStandings,
  displayPointsForTip,
  groupGoalLeaders,
  participantBreakdown,
  playGoals,
  projectTotalGoals,
  scoreBonusQuestion,
} from '../apps/drammen/src/utils/scoring';
import { extraTimeResult } from '../apps/drammen/src/utils/labels';
import { computeProgression } from '../apps/drammen/src/utils/progression';
import { normalizeTeamName } from '../apps/drammen/src/utils/teamNames';
import { applyBonusAnswers, decidedOnly, mergeCustomBonusTips, mergeKnockoutTips } from '../apps/drammen/src/utils/storage';
import { reconcileResults } from '../apps/drammen/src/utils/reconcile';
import { deriveCustomBonus, deriveDecidedBonus, deriveProvisionalAnswers, deriveStatsBonus } from '../apps/drammen/src/utils/autoDerive';
import type { BonusQuestion, MatchResult, Participant } from '../apps/drammen/src/types';

let failures = 0;
function assert(name: string, got: unknown, expected: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'OK ' : 'FEIL'}  ${name}: ${JSON.stringify(got)}${ok ? '' : ` (forventet ${JSON.stringify(expected)})`}`);
}

// 1) Kjernepoeng
console.log('calcPoints:');
assert('eksakt 2-1', calcPoints(2, 1, 2, 1), 3);
assert('eksakt 0-0', calcPoints(0, 0, 0, 0), 3);
assert('riktig utfall hjemme', calcPoints(2, 1, 1, 0), 1);
assert('riktig utfall uavgjort', calcPoints(1, 1, 2, 2), 1);
assert('feil utfall', calcPoints(2, 1, 0, 2), 0);

// 1b) Foreløpige poeng på live-kamp (kun visning – ikke tabellen)
console.log('displayPointsForTip:');
const liveMatch = { status: 'IN_PLAY', homeGoals: 2, awayGoals: 1 } as unknown as MatchResult;
const schedMatch = { status: 'TIMED', homeGoals: null, awayGoals: null } as unknown as MatchResult;
const finishedMatch = { status: 'FINISHED', homeGoals: 0, awayGoals: 0 } as unknown as MatchResult;
assert('live eksakt = 3p (foreløpig)', displayPointsForTip({ home: 2, away: 1 }, liveMatch), 3);
assert('live utfall = 1p (foreløpig)', displayPointsForTip({ home: 1, away: 0 }, liveMatch), 1);
assert('ikke startet = null', displayPointsForTip({ home: 1, away: 0 }, schedMatch), null);
assert('ferdig teller fortsatt', displayPointsForTip({ home: 0, away: 0 }, finishedMatch), 3);

// 1c) projectTotalGoals: live-projeksjon av totale VM-mål
console.log('projectTotalGoals:');
const gm = (status: string, hg: number | null, ag: number | null): MatchResult =>
  ({ status, homeGoals: hg, awayGoals: ag } as unknown as MatchResult);
const projResults: MatchResult[] = [
  gm('FINISHED', 2, 1),
  gm('FINISHED', 1, 1),
  gm('IN_PLAY', 1, 0),
  gm('TIMED', null, null),
];
const proj = projectTotalGoals(projResults)!;
assert('mål så langt (inkl. live)', proj.goalsSoFar, 6);
assert('kamper talt (ferdige + live)', proj.matchesCounted, 3);
assert('projeksjon 6/3 × 4 = 8', proj.projected, 8);
assert('ingen startede kamper → null', projectTotalGoals([gm('TIMED', null, null)]), null);

// 1d) q5: full pott til ALLE innenfor ±5 mål av fasit (grensetilfeller)
console.log('q5 ±5-regel:');
const q5q = BONUS_QUESTIONS.find((q) => q.id === 'q5')!;
const mkBonusP = (name: string, goals: string): Participant =>
  ({ name, groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'q5', answer: goals }] }) as Participant;
const q5score = scoreBonusQuestion(
  [mkBonusP('A', '305'), mkBonusP('B', '295'), mkBonusP('C', '306'), mkBonusP('D', '294')],
  { ...q5q, answer: '300' },
);
assert('+5 = full pott', q5score.get('A'), q5q.maxPoints);
assert('-5 = full pott', q5score.get('B'), q5q.maxPoints);
assert('+6 = 0', q5score.get('C'), 0);
assert('-6 = 0', q5score.get('D'), 0);

// 1e) groupGoalLeaders: hvilken gruppe leder på mål nå (ferdige + live)
console.log('groupGoalLeaders:');
const ggm = (group: string, hg: number, ag: number, status = 'FINISHED'): MatchResult =>
  ({ stage: 'GROUP_STAGE', group, homeGoals: hg, awayGoals: ag, status }) as unknown as MatchResult;
const gl = groupGoalLeaders([
  ggm('GROUP_A', 2, 1), // A: 3
  ggm('GROUP_B', 3, 2), // B: 5
  ggm('GROUP_C', 1, 0, 'IN_PLAY'), // C: 1 (live teller)
])!;
assert('leder = B', gl.leaders.join(','), 'B');
assert('topp-mål = 5', gl.topGoals, 5);
assert('ingen gruppemål → null', groupGoalLeaders([ggm('GROUP_A', 0, 0, 'TIMED')]), null);

// 1f) q7/q8 breakdown: maks 4p (ikke 8), og viser kun laget/lagene som ga poeng
console.log('breakdown q7/q8 (hvilket lag):');
const q7full = BONUS_QUESTIONS.find((q) => q.id === 'q7')!;
const bdP: Participant = {
  name: 'X',
  groupTips: [],
  knockoutTips: [],
  bonusTips: [{ questionId: 'q7', answer: ['Nederland', 'Portugal'] }],
};
const bdOne = participantBreakdown(bdP, [bdP], [], [{ ...q7full, answer: ['Nederland'] }]);
const bdOneItem = bdOne.find((i) => i.kind === 'bonus');
assert('viser kun riktig lag', bdOneItem?.kind === 'bonus' ? bdOneItem.answer : '', 'Nederland');
assert('ett lag = 2p', bdOneItem?.points, 2);
const bdBoth = participantBreakdown(bdP, [bdP], [], [{ ...q7full, answer: ['Nederland', 'Portugal'] }]);
const bdBothItem = bdBoth.find((i) => i.kind === 'bonus');
assert('begge lag = 4p (ikke 8)', bdBothItem?.points, 4);
assert('viser begge lag', bdBothItem?.kind === 'bonus' ? bdBothItem.answer : '', 'Nederland + Portugal');

// 1f2) breakdown-rekkefølge ved SAMTIDIGE kamper: et liste-krydder (q8 selvmål) skal havne rett
// ETTER sin egen kamp, også når en annen kamp har nøyaktig samme avspark (apiId-tiebreak).
console.log('breakdown kronologi ved samtidige kamper (q8):');
const simP: Participant = {
  name: 'X',
  groupTips: [
    { homeTeam: 'Tunisia', awayTeam: 'Nederland', group: 'GROUP_F', homeGoals: 0, awayGoals: 2 }, // 1p (utfall)
    { homeTeam: 'Japan', awayTeam: 'Sverige', group: 'GROUP_F', homeGoals: 1, awayGoals: 1 }, // 3p (eksakt)
  ],
  knockoutTips: [],
  bonusTips: [{ questionId: 'q8', answer: ['Tunisia'] }],
};
const simResults: MatchResult[] = [
  { apiId: 100, stage: 'GROUP_STAGE', group: 'GROUP_F', homeTeam: 'Tunisia', awayTeam: 'Netherlands', homeGoals: 1, awayGoals: 3, status: 'FINISHED', utcDate: '2026-06-25T23:00:00Z' },
  { apiId: 200, stage: 'GROUP_STAGE', group: 'GROUP_F', homeTeam: 'Japan', awayTeam: 'Sweden', homeGoals: 1, awayGoals: 1, status: 'FINISHED', utcDate: '2026-06-25T23:00:00Z' },
];
const q8def = BONUS_QUESTIONS.find((q) => q.id === 'q8')!;
const simBreakdown = participantBreakdown(simP, [simP], simResults, [{ ...q8def, answer: ['Tunisia'] }], {
  q8: { ats: { Tunisia: '2026-06-25T12:00:00Z' } },
});
assert('tre kilder (2 kamp + 1 krydder)', simBreakdown.length, 3);
assert('rekkefølge: Tunisia-kamp, selvmål, Japan-kamp', simBreakdown.map((i) => i.kind), ['match', 'bonus', 'match']);
assert('krydder rett etter sin kamp (Tunisia)', simBreakdown[1].kind === 'bonus' ? simBreakdown[1].answer : '', 'Tunisia');
assert('og før den andre samtidige kampen (Japan)', simBreakdown[2].kind === 'match' ? simBreakdown[2].home : '', 'Japan');

// 1f3) q16 (Bodø/Glimt-spilletid) avgjøres i Norges kamp → chipen skal lande rett ETTER Norge-kampen,
// og før en senere kamp samme kampdag (ikke sist på dagen som før).
console.log('breakdown q16 plasseres etter Norges kamp:');
const q16P: Participant = {
  name: 'X',
  groupTips: [
    { homeTeam: 'Norge', awayTeam: 'Frankrike', group: 'GROUP_E', homeGoals: 1, awayGoals: 1 }, // eksakt = 3p
    { homeTeam: 'Brasil', awayTeam: 'Sveits', group: 'GROUP_G', homeGoals: 2, awayGoals: 0 }, // eksakt = 3p
  ],
  knockoutTips: [],
  bonusTips: [{ questionId: 'q16', answer: 'Ja' }],
};
const q16Results: MatchResult[] = [
  { apiId: 300, stage: 'GROUP_STAGE', group: 'GROUP_E', homeTeam: 'Norway', awayTeam: 'France', homeGoals: 1, awayGoals: 1, status: 'FINISHED', utcDate: '2026-06-20T18:00:00Z' },
  { apiId: 400, stage: 'GROUP_STAGE', group: 'GROUP_G', homeTeam: 'Brazil', awayTeam: 'Switzerland', homeGoals: 2, awayGoals: 0, status: 'FINISHED', utcDate: '2026-06-20T22:00:00Z' },
];
const q16def = BONUS_QUESTIONS.find((q) => q.id === 'q16')!;
const q16Breakdown = participantBreakdown(q16P, [q16P], q16Results, [{ ...q16def, answer: 'Ja' }], {
  q16: { at: '2026-06-20T12:00:00.000Z' },
});
assert('tre kilder (2 kamp + q16)', q16Breakdown.length, 3);
assert('rekkefølge: Norge-kamp, q16, senere kamp', q16Breakdown.map((i) => i.kind), ['match', 'bonus', 'match']);
assert('q16 rett etter Norges kamp (svar Ja)', q16Breakdown[1].kind === 'bonus' ? q16Breakdown[1].answer : '', 'Ja');
assert('og før den senere kampen (Brasil)', q16Breakdown[2].kind === 'match' ? q16Breakdown[2].home : '', 'Brasil');

// 1g) computeProgression: kumulativ poengutvikling per dag (10:00 UTC-grense)
console.log('computeProgression:');
const pm = (h: string, a: string, hg: number, ag: number, g: string, date: string): MatchResult =>
  ({
    apiId: Math.floor(Math.random() * 1e9),
    stage: 'GROUP_STAGE',
    group: g,
    homeTeam: h,
    awayTeam: a,
    homeGoals: hg,
    awayGoals: ag,
    status: 'FINISHED',
    utcDate: date,
  }) as MatchResult;
const prog = computeProgression(
  PARTICIPANTS,
  [
    pm('Mexico', 'South Africa', 2, 0, 'GROUP_A', '2026-06-11T19:00:00Z'), // Erling 2-0 eksakt = 3
    pm('Brazil', 'Morocco', 1, 0, 'GROUP_C', '2026-06-14T19:00:00Z'), // Erling 2-0 → utfall = 1
  ],
  BONUS_QUESTIONS,
  {},
);
assert('progresjon: start + to dager', prog.days.length, 3);
const erlingProg = prog.series.find((s) => s.name === 'Erling')!;
assert('alle starter på 0', erlingProg.totals[0], 0);
assert('Erling dag 1 = 3', erlingProg.totals[1], 3);
assert('Erling dag 2 = 4 (kumulativt)', erlingProg.totals[2], 4);

// 1h) computeProgression: liste-spørsmål (q8 selvmål) datert PER LAG
console.log('computeProgression per-lag-dato (q8):');
const ownGoalP: Participant = {
  name: 'X',
  groupTips: [],
  knockoutTips: [],
  bonusTips: [{ questionId: 'q8', answer: ['Paraguay', 'Spania'] }],
};
const q8full = BONUS_QUESTIONS.find((q) => q.id === 'q8')!;
const ogProg = computeProgression([ownGoalP], [], [{ ...q8full, answer: ['Paraguay', 'Spania'] }], {
  q8: { ats: { Paraguay: '2026-06-13T12:00:00Z', Spania: '2026-06-15T12:00:00Z' } },
});
assert('per-lag: start + to dager', ogProg.days.length, 3);
const ogS = ogProg.series.find((s) => s.name === 'X')!;
assert('start på 0', ogS.totals[0], 0);
assert('dag 1: kun Paraguay = 2p', ogS.totals[1], 2);
assert('dag 2: begge lag = 4p', ogS.totals[2], 4);

// 2) Navnenormalisering (API engelsk -> norsk)
console.log('normalizeTeamName:');
assert('Czechia', normalizeTeamName('Czechia'), 'Tsjekkia');
assert('Ivory Coast', normalizeTeamName('Ivory Coast'), 'Elfenbenskysten');
assert('ukjent uendret', normalizeTeamName('Atlantis'), 'Atlantis');

// 3) Gruppespill-matching mot kjente resultater (engelske API-navn med vilje)
const results: MatchResult[] = [
  m('Mexico', 'South Africa', 2, 0, 'GROUP_A'),
  m('South Korea', 'Czechia', 2, 1, 'GROUP_A'),
  m('Canada', 'Bosnia-Herzegovina', 1, 1, 'GROUP_B'),
  m('Brazil', 'Morocco', 1, 0, 'GROUP_C'),
];

function m(home: string, away: string, hg: number, ag: number, group: string): MatchResult {
  return {
    apiId: Math.floor(Math.random() * 1e9),
    stage: 'GROUP_STAGE',
    group,
    homeTeam: home,
    awayTeam: away,
    homeGoals: hg,
    awayGoals: ag,
    status: 'FINISHED',
    utcDate: '2026-06-11T19:00:00Z',
  };
}

// Erling: Mexico 2-0 (3) | Sør-Korea 1-1 vs 2-1 (0) | Canada 2-1 vs 1-1 (0) | Brasil 2-0 vs 1-0 (1) = 4
const standings = computeStandings(PARTICIPANTS, results, BONUS_QUESTIONS);
const erling = standings.find((s) => s.name === 'Erling')!;
console.log('Gruppespill-matching (Erling, 4 kjente resultater):');
assert('groupPoints', erling.groupPoints, 4);
assert('correctResults', erling.correctResults, 1);
assert('correctOutcomes', erling.correctOutcomes, 1);
assert('wrongOutcomes', erling.wrongOutcomes, 2);
assert('bonusPoints (ingen fasit)', erling.bonusPoints, 0);

// 4) Krydderpoeng med syntetisk fasit (tester alle regelgrener)
const fasit: BonusQuestion[] = BONUS_QUESTIONS.map((q) => {
  if (q.id === 'q1') return { ...q, answer: 'Frankrike' }; // eksakt match
  if (q.id === 'q5') return { ...q, answer: '300' }; // ±5: 299 innenfor → full pott
  if (q.id === 'q6') return { ...q, answer: '00:34' }; // ±15s: Erling 00:35
  if (q.id === 'q7') return { ...q, answer: ['Nederland', 'Irak'] }; // Erling traff Nederland
  return q;
});
const withBonus = computeStandings(PARTICIPANTS, results, fasit);
const find = (n: string) => withBonus.find((s) => s.name === n)!;
console.log('Krydderpoeng (syntetisk fasit):');
// Erling: q1 Frankrike +5, q6 00:35 +2, q7 Nederland (2p/lag) +2 = 9
assert('Erling bonus', find('Erling').bonusPoints, 9);
// Tore: q1 Frankrike +5, q5 nærmest +2 = 7
assert('Tore bonus', find('Tore').bonusPoints, 7);
// Rune: q1 Spania (feil) = 0
assert('Rune bonus', find('Rune').bonusPoints, 0);

// 4b) Admin-lagring: sluttspill-tips + krydder-fasit flettet inn via storage
console.log('Admin-fletting (storage):');
const blank: Participant = { name: 'Test', groupTips: [], bonusTips: [], knockoutTips: [] };
const koResult: MatchResult = {
  apiId: 999, stage: 'ROUND_OF_16', homeTeam: 'France', awayTeam: 'Germany',
  homeGoals: 2, awayGoals: 1, status: 'FINISHED', utcDate: '2026-07-01T19:00:00Z',
};
const koParts = mergeKnockoutTips([blank], { Test: [{ apiId: 999, homeGoals: 2, awayGoals: 1 }] });
const koStand = computeStandings(koParts, [koResult], BONUS_QUESTIONS);
assert('sluttspill eksakt = 3p', koStand[0].knockoutPoints, 3);

const q1WithFasit = applyBonusAnswers(BONUS_QUESTIONS, { q1: 'Frankrike' });
assert('applyBonusAnswers setter fasit', q1WithFasit.find((q) => q.id === 'q1')!.answer, 'Frankrike');

// 4c) reconcileResults: et ferdig resultat skal aldri degraderes/forsvinne
console.log('reconcileResults (API-hikke):');
const settled: MatchResult = m('Canada', 'Bosnia-Herzegovina', 1, 1, 'GROUP_B');
const glitchedBlank: MatchResult = { ...settled, homeGoals: null, awayGoals: null };
const glitchedTimed: MatchResult = { ...settled, status: 'TIMED', homeGoals: null, awayGoals: null };
assert(
  'beholder resultat når nytt svar er blankt',
  reconcileResults([settled], [glitchedBlank])[0].homeGoals,
  1,
);
assert(
  'beholder resultat når nytt svar er TIMED',
  reconcileResults([settled], [glitchedTimed])[0].status,
  'FINISHED',
);
assert(
  'beholder kamp som forsvinner helt',
  reconcileResults([settled], []).length,
  1,
);
assert(
  'ekte oppdatering vinner (uavgjort → korrigert)',
  reconcileResults([settled], [m('Canada', 'Bosnia-Herzegovina', 2, 1, 'GROUP_B')])[0].homeGoals,
  2,
);

// 4d) participantBreakdown: kun poenggivende treff, sum = gruppepoeng
console.log('participantBreakdown (Erling):');
const erlingP = PARTICIPANTS.find((p) => p.name === 'Erling')!;
const breakdown = participantBreakdown(erlingP, PARTICIPANTS, results, BONUS_QUESTIONS);
assert('antall poengkilder (Mexico 3p + Brasil 1p)', breakdown.length, 2);
assert('ingen 0-poengs-kilder', breakdown.every((i) => i.points > 0), true);
assert('sum = gruppepoeng (4)', breakdown.reduce((s, i) => s + i.points, 0), 4);

// 4e) computeRankDeltas: bevegelse etter siste (seneste) resultat-pulje
console.log('computeRankDeltas (to puljer):');
const rkMatch = (apiId: number, h: string, a: string, hg: number, ag: number, date: string): MatchResult => ({
  apiId, stage: 'GROUP_STAGE', group: 'GROUP_A', homeTeam: h, awayTeam: a,
  homeGoals: hg, awayGoals: ag, status: 'FINISHED', utcDate: date,
});
const gtip = (h: string, a: string, hg: number, ag: number) => ({
  homeTeam: h, awayTeam: a, group: 'GROUP_A', homeGoals: hg, awayGoals: ag,
});
const m1 = rkMatch(1, 'A1', 'A2', 1, 0, '2026-06-12T19:00:00Z'); // tidlig pulje
const m2 = rkMatch(2, 'B1', 'B2', 1, 0, '2026-06-13T19:00:00Z'); // seneste pulje
const rkP1: Participant = { name: 'P1', groupTips: [gtip('A1', 'A2', 1, 0), gtip('B1', 'B2', 0, 1)], bonusTips: [], knockoutTips: [] };
const rkP2: Participant = { name: 'P2', groupTips: [gtip('A1', 'A2', 0, 1), gtip('B1', 'B2', 1, 0)], bonusTips: [], knockoutTips: [] };
const rkParts = [rkP1, rkP2];
const rkResults = [m1, m2];
// Før m2: P1=3 (rank1), P2=0 (rank2). Etter m2: begge=3 (delt rank1).
const rkCurrent = computeStandings(rkParts, rkResults, BONUS_QUESTIONS);
const rkDeltas = computeRankDeltas(rkCurrent, rkParts, rkResults, BONUS_QUESTIONS);
assert('P2 gikk opp (+1)', rkDeltas.get('P2'), 1);
assert('P1 uendret (0)', rkDeltas.get('P1'), 0);

// 4e2) hele runden grupperes på tvers av UTC-midnatt (grense 10:00 UTC / 12:00 norsk)
const e0 = rkMatch(10, 'C1', 'C2', 1, 0, '2026-06-12T12:00:00Z'); // forrige runde
const e1 = rkMatch(11, 'A1', 'A2', 1, 0, '2026-06-13T21:00:00Z'); // 23:00 norsk 13/6
const e2 = rkMatch(12, 'B1', 'B2', 1, 0, '2026-06-14T02:00:00Z'); // 04:00 norsk 14/6 (samme runde, krysser UTC-midnatt)
const eP1: Participant = { name: 'E1', groupTips: [gtip('C1', 'C2', 1, 0), gtip('A1', 'A2', 0, 1), gtip('B1', 'B2', 0, 1)], bonusTips: [], knockoutTips: [] }; // kun e0 → 3
const eP2: Participant = { name: 'E2', groupTips: [gtip('C1', 'C2', 0, 1), gtip('A1', 'A2', 1, 0), gtip('B1', 'B2', 1, 0)], bonusTips: [], knockoutTips: [] }; // e1+e2 → 6
const eParts = [eP1, eP2];
const eResults = [e0, e1, e2];
const eDeltas = computeRankDeltas(computeStandings(eParts, eResults, BONUS_QUESTIONS), eParts, eResults, BONUS_QUESTIONS);
// Før siste kampdag (kun e0): E1 #1, E2 #2. Etter: E2 #1, E1 #2. ▲ kun mulig hvis e1+e2 grupperes.
assert('E2 opp 1 (hele kampdagen gruppert)', eDeltas.get('E2'), 1);
assert('E1 ned 1', eDeltas.get('E1'), -1);

// 4e3) krydder avgjort i siste runde flytter pilene (tidsavgrenset via bonusInfo, som grafen).
// K1 leder på kamp etter dag 1; et krydder dag 2 gir K2 nok til å gå forbi → pilen må vise det.
const km1 = rkMatch(20, 'A1', 'A2', 1, 0, '2026-06-12T19:00:00Z'); // dag 1
const kQuestions = BONUS_QUESTIONS.map((q) => (q.id === 'q1' ? { ...q, answer: 'Brasil' } : q));
const kP1: Participant = { name: 'K1', groupTips: [gtip('A1', 'A2', 1, 0)], bonusTips: [{ questionId: 'q1', answer: 'Argentina' }], knockoutTips: [] }; // kamp 3, krydder 0
const kP2: Participant = { name: 'K2', groupTips: [gtip('A1', 'A2', 0, 1)], bonusTips: [{ questionId: 'q1', answer: 'Brasil' }], knockoutTips: [] }; // kamp 0, krydder 5
const kParts = [kP1, kP2];
const kCurrent = computeStandings(kParts, [km1], kQuestions); // K2=5 #1, K1=3 #2
const kInfo = { q1: { at: '2026-06-13T12:00:00.000Z' } }; // q1 avgjort på dag 2 (siste runde)
const kDeltas = computeRankDeltas(kCurrent, kParts, [km1], kQuestions, kInfo);
// Før dag 2 (krydder fjernet): K1 #1, K2 #2. Etter: K2 #1, K1 #2.
assert('K2 opp 1 (krydder i siste runde teller)', kDeltas.get('K2'), 1);
assert('K1 ned 1 (krydder i siste runde teller)', kDeltas.get('K1'), -1);

// 4f) q7/q8: 2p per korrekt lag (maks 4); q15: full pott hvis kjendis i lista
console.log('Liste-spørsmål:');
const q7q = BONUS_QUESTIONS.find((q) => q.id === 'q7')!;
const q8q = BONUS_QUESTIONS.find((q) => q.id === 'q8')!;
const q15q = BONUS_QUESTIONS.find((q) => q.id === 'q15')!;
// Erling: q7-tip ["Nederland","Portugal"], q8-tip ["Curacao","Kapp Verde"], q15-tip "Prinsesse Astrid"
assert('q7 ett riktig = 2p', scoreBonusQuestion(PARTICIPANTS, { ...q7q, answer: ['Nederland'] }).get('Erling'), 2);
assert('q7 begge riktige = 4p', scoreBonusQuestion(PARTICIPANTS, { ...q7q, answer: ['Nederland', 'Portugal'] }).get('Erling'), 4);
assert('q8 ett riktig = 2p', scoreBonusQuestion(PARTICIPANTS, { ...q8q, answer: ['Curacao'] }).get('Erling'), 2);
assert('q8 begge riktige = 4p', scoreBonusQuestion(PARTICIPANTS, { ...q8q, answer: ['Curacao', 'Kapp Verde'] }).get('Erling'), 4);
assert('q15 kjendis i lista = 3p', scoreBonusQuestion(PARTICIPANTS, { ...q15q, answer: ['Prinsesse Astrid', 'Pave Frans'] }).get('Erling'), 3);
assert('q15 kjendis ikke i lista = 0p', scoreBonusQuestion(PARTICIPANTS, { ...q15q, answer: ['Pave Frans'] }).get('Erling'), 0);

// 4b) Auto-krydder pulje B (deriveDecidedBonus) – låses kun når avgjort
console.log('\nderiveDecidedBonus (lås når avgjort):');
const mk = (o: Partial<MatchResult>): MatchResult => ({
  apiId: 0,
  stage: 'GROUP_STAGE',
  homeTeam: 'TBD',
  awayTeam: 'TBD',
  homeGoals: null,
  awayGoals: null,
  status: 'SCHEDULED',
  utcDate: '2026-06-20T18:00:00Z',
  ...o,
});
// Gruppespill IKKE ferdig → q10 ikke satt
const gsPartial = [
  mk({ stage: 'GROUP_STAGE', group: 'GROUP_A', homeTeam: 'Mexico', awayTeam: 'South Africa', homeGoals: 2, awayGoals: 0, status: 'FINISHED' }),
  mk({ stage: 'GROUP_STAGE', group: 'GROUP_A', homeTeam: 'South Korea', awayTeam: 'Czechia', status: 'SCHEDULED' }),
];
assert('q10 ikke satt før gruppespill ferdig', deriveDecidedBonus(gsPartial).q10, undefined);
// Lite, komplett «gruppespill» (alle ferdige) → q10 = dårligste (South Africa, 0p)
const gsDone = [
  mk({ stage: 'GROUP_STAGE', group: 'GROUP_A', homeTeam: 'Mexico', awayTeam: 'South Africa', homeGoals: 2, awayGoals: 0, status: 'FINISHED', utcDate: '2026-06-11T18:00:00Z' }),
  mk({ stage: 'GROUP_STAGE', group: 'GROUP_A', homeTeam: 'South Korea', awayTeam: 'Mexico', homeGoals: 1, awayGoals: 1, status: 'FINISHED', utcDate: '2026-06-12T18:00:00Z' }),
];
const dDone = deriveDecidedBonus(gsDone);
assert('q10 satt når gruppespill ferdig', typeof dDone.q10 === 'object' && (dDone.q10 as { answer: string }).answer, 'Sør-Afrika');
assert('q10 dato = siste gruppedag', (dDone.q10 as { at: string }).at, '2026-06-12T12:00:00.000Z');
assert('q5 satt når alt ferdig (4 mål)', (dDone.q5 as { answer: string }).answer, '4');
assert('q9 satt når gruppespill ferdig (gruppe A)', (dDone.q9 as { answer: string[] }).answer.join(','), 'A');
// q9-scoring: gruppe-bokstav-matching robust mot format
const q9q = BONUS_QUESTIONS.find((q) => q.id === 'q9')!;
const q9p: Participant[] = [
  { name: 'A', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'q9', answer: 'Gruppe I' }] },
  { name: 'B', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'q9', answer: 'gruppe c' }] },
];
assert('q9 «Gruppe I» mot fasit [I] = full pott', scoreBonusQuestion(q9p, { ...q9q, answer: ['I'] }).get('A'), q9q.maxPoints);
assert('q9 feil gruppe = 0', scoreBonusQuestion(q9p, { ...q9q, answer: ['I'] }).get('B') ?? 0, 0);
assert('q9 uavgjort [I,L] – tippet I = full pott', scoreBonusQuestion(q9p, { ...q9q, answer: ['I', 'L'] }).get('A'), q9q.maxPoints);
// q1: finale ferdig – bruker API-ets `winner`.
const withFinal = [
  mk({ stage: 'FINAL', homeTeam: 'France', awayTeam: 'Brazil', homeGoals: 2, awayGoals: 1, status: 'FINISHED', winner: 'HOME_TEAM', utcDate: '2026-07-19T18:00:00Z' }),
];
assert('q1 = finalevinner (Frankrike)', (deriveDecidedBonus(withFinal).q1 as { answer: string }).answer, 'Frankrike');
// q1: finale avgjort på straffer (1–1 etter 90, men `winner` peker på borte) → Brasil.
const penFinal = [mk({ stage: 'FINAL', homeTeam: 'France', awayTeam: 'Brazil', homeGoals: 1, awayGoals: 1, penHomeGoals: 3, penAwayGoals: 4, duration: 'PENALTY_SHOOTOUT', winner: 'AWAY_TEAM', status: 'FINISHED' })];
assert('q1 = straffevinner (Brasil)', (deriveDecidedBonus(penFinal).q1 as { answer: string }).answer, 'Brasil');
// q1: ingen winner ennå → ikke auto.
const noWinnerFinal = [mk({ stage: 'FINAL', homeTeam: 'France', awayTeam: 'Brazil', homeGoals: 1, awayGoals: 1, status: 'FINISHED' })];
assert('q1 ikke satt uten winner', deriveDecidedBonus(noWinnerFinal).q1, undefined);

// 4c) Auto-krydder pulje 1 (deriveStatsBonus) – aggregator-basert
console.log('\nderiveStatsBonus (aggregator-basert):');
const baseStats = { topScorers: [], topAssists: [], topCards: [], teamCards: [] };
const overResults = [
  mk({ stage: 'FINAL', homeTeam: 'France', awayTeam: 'Brazil', homeGoals: 2, awayGoals: 1, status: 'FINISHED', utcDate: '2026-07-19T18:00:00Z' }),
];
assert('q11 = finaledommer når kjent', (deriveStatsBonus({ ...baseStats, finalReferee: 'Pierluigi Collina' }, []).q11 as { answer: string }).answer, 'Pierluigi Collina');
assert('q16 = Ja når alle tre Glimt spilte', (deriveStatsBonus({ ...baseStats, playedIds: [37913, 37924, 37916, 99] }, []).q16 as { answer: string }).answer, 'Ja');
assert('q16 ikke satt før avgjort (mangler spiller)', deriveStatsBonus({ ...baseStats, playedIds: [37913] }, []).q16, undefined);
assert('q16 = Nei når turnering ferdig og mangler', (deriveStatsBonus({ ...baseStats, playedIds: [37913] }, overResults).q16 as { answer: string }).answer, 'Nei');
// q16-dato = kampdagen der den SISTE Glimt-spilleren debuterte (maks av per-spiller-datoer), ikke «siste kampdag».
const q16dated = deriveStatsBonus({ ...baseStats, playedIds: [37913, 37924, 37916],
  playedAt: { 37913: '2026-06-14T12:00:00.000Z', 37924: '2026-06-14T12:00:00.000Z', 37916: '2026-06-20T12:00:00.000Z' } }, overResults);
assert('q16 dato = siste Glimt-debut (Norge-kampen)', (q16dated.q16 as { at: string }).at, '2026-06-20T12:00:00.000Z');
const q3store = deriveStatsBonus({ ...baseStats, topScorers: [
  { id: 1, name: 'Kylian Mbappe', team: 'France', position: '', goals: 8 },
  { id: 2, name: 'Harry Kane', team: 'England', position: '', goals: 6 },
] }, overResults);
assert('q3 inkluderer toppscorer-etternavn', (q3store.q3 as { answer: string[] }).answer.includes('Mbappe'), true);
assert('q3 ikke satt før turnering ferdig', deriveStatsBonus({ ...baseStats, topScorers: [{ id: 1, name: 'X', team: 'Y', position: '', goals: 3 }] }, []).q3, undefined);
const q13store = deriveStatsBonus({ ...baseStats, goalsByPlayer: { '44': 3, '3218': 1 } }, overResults);
assert('q13 = Ronaldo når flest', (q13store.q13 as { answer: string[] }).answer.includes('Ronaldo'), true);
assert('q13 ikke Messi når færre', (q13store.q13 as { answer: string[] }).answer.includes('Messi'), false);

// 4c3) R32-krydder: q18 (mest målrik) + q19 (flest gule) kamp-match, q20 (Superior Player) per-spiller.
console.log('\nq18/q19 kamp-match + q20 per-spiller:');
const mkR32P = (name: string, ans: string | string[], qid = 'q18'): Participant =>
  ({ name, groupTips: [], knockoutTips: [], bonusTips: [{ questionId: qid, answer: ans }] });
const q18def = BONUS_QUESTIONS.find((q) => q.id === 'q18')!;
const q18parts = [
  mkR32P('Eksakt', 'Frankrike - Sverige'),
  mkR32P('Typo', 'Frankriket-Sverige'),
  mkR32P('Reversert', 'Sverige - Frankrike'),
  mkR32P('ZcVariant', 'USA - Bosnia-Herzegovina'),
  mkR32P('Feil', 'Mexico - Ecuador'),
];
const q18pts = scoreBonusQuestion(q18parts, { ...q18def, answer: 'Frankrike - Sverige' });
assert('q18 eksakt = 2p', q18pts.get('Eksakt'), 2);
assert('q18 typo «Frankriket» = 2p', q18pts.get('Typo'), 2);
assert('q18 reversert rekkefølge = 2p', q18pts.get('Reversert'), 2);
assert('q18 feil kamp = 0p', q18pts.get('Feil'), 0);
assert('q18 Herzegovina vs Hercegovina = 2p',
  scoreBonusQuestion(q18parts, { ...q18def, answer: 'USA - Bosnia-Hercegovina' }).get('ZcVariant'), 2);
const q18tie = scoreBonusQuestion(q18parts, { ...q18def, answer: ['Mexico - Ecuador', 'Frankrike - Sverige'] });
assert('q18 fasit-liste (likhet): Feil-tipper treffer Mexico = 2p', q18tie.get('Feil'), 2);
assert('q18 fasit-liste (likhet): Eksakt treffer Frankrike = 2p', q18tie.get('Eksakt'), 2);

const q20def = BONUS_QUESTIONS.find((q) => q.id === 'q20')!;
const q20parts = [
  mkR32P('Begge', ['Messi', 'Haaland'], 'q20'),
  mkR32P('Ett', ['Messi', 'Mbappe'], 'q20'),
  mkR32P('Ingen', ['Kane', 'Ronaldo'], 'q20'),
];
const q20parts2 = [...q20parts, mkR32P('Duplikat', ['Messi', 'Messi'], 'q20')];
const q20pts = scoreBonusQuestion(q20parts2, { ...q20def, answer: ['Messi', 'Haaland'] });
assert('q20 begge riktige = 4p', q20pts.get('Begge'), 4);
assert('q20 ett riktig = 2p', q20pts.get('Ett'), 2);
assert('q20 ingen riktige = 0p', q20pts.get('Ingen'), 0);
// Samme korrekte navn nevnt to ganger teller som ÉN → 2p (ikke dobbelt til 4p).
assert('q20 duplikat av ett riktig = 2p (ikke 4p)', q20pts.get('Duplikat'), 2);

console.log('\nderiveDecidedBonus/deriveStatsBonus q18/q19 (R32):');
const r32done = [
  mk({ stage: 'ROUND_OF_32', homeTeam: 'France', awayTeam: 'Sweden', homeGoals: 3, awayGoals: 2, status: 'FINISHED', apiId: 1, utcDate: '2026-06-29T18:00:00Z' }),
  mk({ stage: 'ROUND_OF_32', homeTeam: 'Mexico', awayTeam: 'Ecuador', homeGoals: 1, awayGoals: 0, status: 'FINISHED', apiId: 2, utcDate: '2026-06-29T20:00:00Z' }),
];
assert('q18 = mest målrik R32-kamp', (deriveDecidedBonus(r32done).q18 as { answer: string }).answer, 'Frankrike - Sverige');
assert('q18 ikke satt før alle R32 ferdige',
  deriveDecidedBonus([r32done[0], mk({ stage: 'ROUND_OF_32', homeTeam: 'Mexico', awayTeam: 'Ecuador', status: 'TIMED', apiId: 2 })]).q18, undefined);
assert('q19 = R32-kamp med flest gule', (deriveStatsBonus({ ...baseStats, matchYellows: { 1: 5, 2: 8 } }, r32done).q19 as { answer: string }).answer, 'Mexico - Ecuador');
assert('q19 ikke satt uten matchYellows', deriveStatsBonus({ ...baseStats }, r32done).q19, undefined);

// 4c3b) Custom auto-krydder (R16): 'match'-scoring + deriveCustomBonus (k1/k2/k3).
console.log('\nderiveCustomBonus (custom auto R16) + match-scoring:');

// 'match'-scoring matcher kamp rekkefølge-uavhengig (som q18/q19), også for custom-spørsmål.
const kMatchQ: BonusQuestion = {
  id: 'k3', question: '', maxPoints: 2, answer: 'Norge - Brasil', scoring: 'match', custom: true,
};
const kMatchParts: Participant[] = [
  { name: 'Rett', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'k3', answer: 'Brasil - Norge' }] },
  { name: 'Feil', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'k3', answer: 'Norge - Sverige' }] },
];
assert("scoring 'match' reversert rekkefølge = 2p", scoreBonusQuestion(kMatchParts, kMatchQ).get('Rett'), 2);
assert("scoring 'match' feil kamp = 0p", scoreBonusQuestion(kMatchParts, kMatchQ).get('Feil'), 0);

const k1: BonusQuestion = { id: 'k1', question: '', maxPoints: 2, answer: null, scoring: 'number', margin: 0, stage: 'ROUND_OF_16', auto: 'extraTimeCount', custom: true };
const k2: BonusQuestion = { id: 'k2', question: '', maxPoints: 2, answer: null, scoring: 'match', stage: 'ROUND_OF_16', auto: 'redOrPenaltyMatch', custom: true };
const k3: BonusQuestion = { id: 'k3', question: '', maxPoints: 2, answer: null, scoring: 'match', stage: 'ROUND_OF_16', auto: 'fewestGoalsMatch', custom: true };
const r16 = [
  mk({ stage: 'ROUND_OF_16', apiId: 101, homeTeam: 'France', awayTeam: 'Sweden', homeGoals: 2, awayGoals: 2, duration: 'EXTRA_TIME', status: 'FINISHED', utcDate: '2026-07-03T18:00:00Z' }),
  mk({ stage: 'ROUND_OF_16', apiId: 102, homeTeam: 'Mexico', awayTeam: 'Ecuador', homeGoals: 0, awayGoals: 0, duration: 'PENALTY_SHOOTOUT', status: 'FINISHED', utcDate: '2026-07-03T20:00:00Z' }),
  mk({ stage: 'ROUND_OF_16', apiId: 103, homeTeam: 'Brazil', awayTeam: 'Norway', homeGoals: 3, awayGoals: 1, duration: 'REGULAR', status: 'FINISHED', utcDate: '2026-07-04T18:00:00Z' }),
];
// 101 rødt kort, 103 straffemål i åpent spill → begge kvalifiserer for k2.
const cbStats = { ...baseStats, matchReds: { 101: 1, 102: 0, 103: 0 }, matchPenaltyGoals: { 101: 0, 102: 0, 103: 1 } };
const cb = deriveCustomBonus([k1, k2, k3], cbStats, r16);
assert('k1 = antall e.o./straffe-kamper (2)', (cb.decided.k1 as { answer: string }).answer, '2');
assert('k2 = kamper m/ rødt kort el. straffe', (cb.decided.k2 as { answer: string[] }).answer, ['Frankrike - Sverige', 'Brasil - Norge']);
assert('k3 = kamp m/ færrest 90-min-mål', (cb.decided.k3 as { answer: string }).answer, 'Mexico - Ecuador');

// Ikke låst før alle R16 ferdige (én TIMED igjen), men foreløpig hint finnes.
const r16partial = [r16[0], r16[1], mk({ stage: 'ROUND_OF_16', apiId: 103, homeTeam: 'Brazil', awayTeam: 'Norway', status: 'TIMED', utcDate: '2026-07-04T18:00:00Z' })];
const cbPartial = deriveCustomBonus([k1, k2, k3], cbStats, r16partial);
assert('k1 ikke låst før R16 ferdig', cbPartial.decided.k1, undefined);
assert('k3 ikke låst før R16 ferdig', cbPartial.decided.k3, undefined);
assert('k1 foreløpig hint finnes underveis', typeof cbPartial.preliminary.k1, 'string');
// k2 låses ikke uten deep data (matchReds/matchPenaltyGoals mangler).
assert('k2 ikke låst uten stats', deriveCustomBonus([k1, k2, k3], null, r16).decided.k2, undefined);

// 4c3c) Nye custom-autoer (QF): cardedPlayers (perItem) + earliestGoalMatch + penaltyShootoutYesNo.
console.log('\nderiveCustomBonus (QF: kort-spillere, tidligste mål, straffekonk):');
const k4: BonusQuestion = { id: 'k4', question: '', maxPoints: 4, answer: null, scoring: 'perItem', perItemPoints: 2, stage: 'QUARTER_FINALS', auto: 'cardedPlayers', custom: true };
const k5: BonusQuestion = { id: 'k5', question: '', maxPoints: 2, answer: null, scoring: 'match', stage: 'QUARTER_FINALS', auto: 'earliestGoalMatch', custom: true };
const k6: BonusQuestion = { id: 'k6', question: '', maxPoints: 2, answer: null, scoring: 'exact', stage: 'QUARTER_FINALS', auto: 'penaltyShootoutYesNo', custom: true };
const qf = [
  mk({ stage: 'QUARTER_FINALS', apiId: 201, homeTeam: 'France', awayTeam: 'Morocco', homeGoals: 1, awayGoals: 0, duration: 'REGULAR', status: 'FINISHED', utcDate: '2026-07-09T20:00:00Z' }),
  mk({ stage: 'QUARTER_FINALS', apiId: 202, homeTeam: 'Norway', awayTeam: 'England', homeGoals: 1, awayGoals: 1, duration: 'PENALTY_SHOOTOUT', status: 'FINISHED', utcDate: '2026-07-11T21:00:00Z' }),
];
const qfStats = {
  ...baseStats,
  matchCardedPlayers: { 201: ['Erling Haaland'], 202: ['Jude Bellingham', 'Kevin De Bruyne'] },
  matchFirstGoal: { 201: 23, 202: 12 },
};
const qcb = deriveCustomBonus([k4, k5, k6], qfStats, qf);
assert('k4 fasit = fulle navn + etternavn (inkl. partikkel-form)', (qcb.decided.k4 as { answer: string[] }).answer, ['Erling Haaland', 'Haaland', 'Jude Bellingham', 'Bellingham', 'Kevin De Bruyne', 'Bruyne', 'De Bruyne']);
assert('k5 = kamp m/ tidligste mål (12. min)', (qcb.decided.k5 as { answer: string }).answer, 'Norge - England');
assert('k6 = Ja (straffekonk i runden)', (qcb.decided.k6 as { answer: string }).answer, 'Ja');

// perItem-scoring mot k4-fasiten: etternavn holder; maks-taket capper.
const k4Scored: BonusQuestion = { ...k4, answer: (qcb.decided.k4 as { answer: string[] }).answer };
const k4Parts: Participant[] = [
  { name: 'En', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'k4', answer: ['Haaland', 'Ødegaard'] }] },
  { name: 'To', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'k4', answer: ['Haaland', 'De Bruyne'] }] },
];
assert('k4: 1 av 2 riktig = 2p', scoreBonusQuestion(k4Parts, k4Scored).get('En'), 2);
assert('k4: 2 av 2 riktig (m/ partikkel-etternavn) = 4p (maks)', scoreBonusQuestion(k4Parts, k4Scored).get('To'), 4);
// Custom-tips lagres som RÅ komma-streng (admin-grid/Importer) – må splittes per navn.
const k4Raw: Participant[] = [
  { name: 'Rå', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'k4', answer: 'Haaland, Bellingham' }] },
];
assert('k4: komma-streng-tips splittes = 4p', scoreBonusQuestion(k4Raw, k4Scored).get('Rå'), 4);

// Skrivefeil-toleranse (bonusItemMatches): å/aa- og ø-varianter + maks én bokstav feil for
// navn ≥ 5 tegn; korte navn krever eksakt nøkkel («Kane» treffer aldri «Kante»).
const k4Typo: Participant[] = [
  { name: 'Typo', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'k4', answer: 'Håland, Bellingam' }] },
  { name: 'Kort', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'k4', answer: 'Kane' }] },
];
const k4Kante: BonusQuestion = { ...k4, answer: ['Kante', 'Haaland', 'Bellingham'] };
assert('k4: «Håland» + «Bellingam» (skrivefeil) = 4p', scoreBonusQuestion(k4Typo, k4Scored).get('Typo'), 4);
assert('k4: «Kane» treffer ikke «Kante» (kort navn) = 0p', scoreBonusQuestion(k4Typo, k4Kante).get('Kort') ?? 0, 0);
// q15-style liste (kjendis): fuzzy medlemskap.
const q15ish: BonusQuestion = { id: 'q15', question: '', maxPoints: 3, answer: ['Sean Connery', 'Dolly Parton'] };
const q15Parts: Participant[] = [
  { name: 'Nesten', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'q15', answer: 'Dolly Partton' }] },
];
assert('q15: «Dolly Partton» treffer fasit = 3p', scoreBonusQuestion(q15Parts, q15ish).get('Nesten'), 3);

// Underveis (én kamp igjen): k4 scorer løpende (akkumulerende), k5 låses ikke, «Nei» låses ikke.
const qfPartial = [qf[0], mk({ stage: 'QUARTER_FINALS', apiId: 202, homeTeam: 'Norway', awayTeam: 'England', status: 'TIMED', utcDate: '2026-07-11T21:00:00Z' })];
const qcbP = deriveCustomBonus([k4, k5, k6], qfStats, qfPartial);
assert('k4 scorer løpende (kort i kamp 1)', (qcbP.decided.k4 as { answer: string[] }).answer, ['Erling Haaland', 'Haaland']);
assert('k5 ikke låst før runden er ferdig', qcbP.decided.k5, undefined);
assert('k6 «Nei» låses ikke underveis', qcbP.decided.k6, undefined);
// … men «Ja» låses umiddelbart når en straffekonk HAR skjedd (kan aldri omgjøres).
const qfPen = [qf[1], mk({ stage: 'QUARTER_FINALS', apiId: 201, homeTeam: 'France', awayTeam: 'Morocco', status: 'TIMED', utcDate: '2026-07-09T20:00:00Z' })];
assert('k6 «Ja» låses umiddelbart underveis', (deriveCustomBonus([k6], qfStats, qfPen).decided.k6 as { answer: string }).answer, 'Ja');
// k4/k5 låses ikke uten deep data (matchCardedPlayers/matchFirstGoal mangler).
const qcbNoStats = deriveCustomBonus([k4, k5, k6], null, qf);
assert('k4 ikke låst uten stats', qcbNoStats.decided.k4, undefined);
assert('k5 ikke låst uten stats', qcbNoStats.decided.k5, undefined);

// 4c4) Ekstraomganger/straffer: straffemål teller ALDRI som resultat/i målstatistikk; tips
// scores mot 90-min-resultatet; ekstraomgangsmål teller.
console.log('\nEkstraomganger/straffer (straffemål teller ikke):');
// Straffekonk: 1–1 etter 90 (og e.o.), Paraguay vinner 4–3 på straffer (hjemme=Tyskland).
const penMatch = mk({
  stage: 'ROUND_OF_32', apiId: 10, homeTeam: 'Germany', awayTeam: 'Paraguay',
  homeGoals: 1, awayGoals: 1, aetHomeGoals: 1, aetAwayGoals: 1,
  penHomeGoals: 3, penAwayGoals: 4, duration: 'PENALTY_SHOOTOUT', winner: 'AWAY_TEAM',
  status: 'FINISHED', utcDate: '2026-06-29T18:00:00Z',
});
// Ekstraomganger uten straffer: 2–2 etter 90, 3–2 etter e.o.
const etMatch = mk({
  stage: 'ROUND_OF_32', apiId: 11, homeTeam: 'Spain', awayTeam: 'Italy',
  homeGoals: 2, awayGoals: 2, aetHomeGoals: 3, aetAwayGoals: 2,
  duration: 'EXTRA_TIME', winner: 'HOME_TEAM', status: 'FINISHED', utcDate: '2026-06-29T20:00:00Z',
});
// Vanlig kamp avgjort innen 90.
const regMatch = mk({
  stage: 'ROUND_OF_32', apiId: 12, homeTeam: 'Mexico', awayTeam: 'Ecuador',
  homeGoals: 4, awayGoals: 0, duration: 'REGULAR', winner: 'HOME_TEAM',
  status: 'FINISHED', utcDate: '2026-06-30T18:00:00Z',
});
// playGoals: straffemål ekskl., ekstraomgangsmål inkl.
assert('playGoals straffekonk = 1–1 (ikke 4–5)', playGoals(penMatch), { home: 1, away: 1 });
assert('playGoals ekstraomganger = 3–2', playGoals(etMatch), { home: 3, away: 2 });
assert('playGoals vanlig = 4–0', playGoals(regMatch), { home: 4, away: 0 });
// Tips scores mot 90-min-resultatet (1–1), ikke straffene.
assert('tip 1–1 på straffekamp = 3p (eksakt etter 90)', displayPointsForTip({ home: 1, away: 1 }, penMatch), 3);
assert('tip 1–2 på straffekamp = 0p (feil utfall etter 90)', displayPointsForTip({ home: 1, away: 2 }, penMatch), 0);
// q18 (mest målrik): teller KUN 90-min-mål – verken ekstraomganger eller straffer. e.o.-kampen
// er 2–2 etter 90 (= 4 mål; det 3. Spania-målet kom i e.o. og teller ikke), så den blåses ikke
// opp til 5 og havner likt med den vanlige 4–0-kampen – begge gjelder ved likhet.
const etR32 = [penMatch, etMatch, regMatch];
assert('q18 teller kun 90-min-mål (e.o.-/straffemål teller ikke)',
  (deriveDecidedBonus(etR32).q18 as { answer: string[] }).answer, ['Spania - Italy', 'Mexico - Ecuador']);
// q5 (totale mål): 2 + 5 + 4 = 11 (straffer teller ikke).
assert('q5 teller e.o.-mål men ikke straffer (11)', (deriveDecidedBonus(etR32).q5 as { answer: string }).answer, '11');
// Visnings-indikator.
assert('extraTimeResult straffekamp', extraTimeResult(penMatch), 'str. 3–4');
assert('extraTimeResult e.o.-kamp', extraTimeResult(etMatch), 'e.o. 3–2');
assert('extraTimeResult vanlig = null', extraTimeResult(regMatch), null);

// 4c2) q12/q14 live-indikator: GUL for ALLE som fortsatt kan gå videre (ikke bare lengst nådd),
// og aldri grønn før avgjort. Et lag «lever» hvis det har en kamp som ikke er ferdigspilt.
console.log('\nderiveProvisionalAnswers q12/q14 (fortsatt med):');
const aliveResults = [
  mk({ homeTeam: 'Japan', awayTeam: 'Brazil', status: 'TIMED' }), // øynasjon, kommende kamp -> med
  mk({ homeTeam: 'New Zealand', awayTeam: 'Iran', status: 'TIMED' }), // øynasjon, gjenstående -> med
  mk({ homeTeam: 'Haiti', awayTeam: 'Scotland', status: 'FINISHED' }), // øynasjon, kun ferdig -> ute
  mk({ homeTeam: 'Egypt', awayTeam: 'Belgium', status: 'TIMED' }), // afrikansk, gjenstående -> med
  mk({ homeTeam: 'Tunisia', awayTeam: 'Netherlands', status: 'FINISHED' }), // afrikansk, kun ferdig -> ute
];
const prov = deriveProvisionalAnswers(null, aliveResults);
const q12alive = (prov.q12 as string[]) ?? [];
const q14alive = (prov.q14 as string[]) ?? [];
assert('q12: Japan fortsatt med (gul)', q12alive.includes('Japan'), true);
assert('q12: New Zealand fortsatt med (gul)', q12alive.includes('New Zealand'), true);
assert('q12: Haiti utslått (ikke med)', q12alive.includes('Haiti'), false);
assert('q14: Egypt fortsatt med (gul)', q14alive.includes('Egypt'), true);
assert('q14: Tunisia utslått (ikke med)', q14alive.includes('Tunisia'), false);

// 4d) Avgjort-flagg (decidedOnly)
console.log('\ndecidedOnly (Avgjort-checkbox):');
assert('avgjort entry beholdes', decidedOnly({ q1: { answer: 'X', decided: true } }).q1 !== undefined, true);
assert('utkast (decided:false) filtreres bort', decidedOnly({ q1: { answer: 'X', decided: false } }).q1, undefined);
assert('ren verdi regnes som avgjort', decidedOnly({ q1: 'X' }).q1, 'X');

// 4e) Pulje 2: «kommer lengst» (q12/q14/q17) – låses så snart alle kandidatene er slått ut
console.log('\nderiveDecidedBonus «kommer lengst» (q12/q14/q17):');
const knockout = [
  mk({ stage: 'FINAL', homeTeam: 'France', awayTeam: 'Brazil', homeGoals: 2, awayGoals: 1, status: 'FINISHED', utcDate: '2026-07-19T18:00:00Z' }),
  mk({ stage: 'QUARTER_FINALS', homeTeam: 'Japan', awayTeam: 'Spain', homeGoals: 0, awayGoals: 2, status: 'FINISHED', utcDate: '2026-07-10T18:00:00Z' }),
  mk({ stage: 'ROUND_OF_16', homeTeam: 'New Zealand', awayTeam: 'Italy', homeGoals: 0, awayGoals: 1, status: 'FINISHED', utcDate: '2026-07-05T18:00:00Z' }),
  mk({ stage: 'SEMI_FINALS', homeTeam: 'Morocco', awayTeam: 'France', homeGoals: 0, awayGoals: 1, status: 'FINISHED', utcDate: '2026-07-15T18:00:00Z' }),
  mk({ stage: 'ROUND_OF_32', homeTeam: 'Norway', awayTeam: 'Spain', homeGoals: 0, awayGoals: 1, status: 'FINISHED', utcDate: '2026-07-01T18:00:00Z' }),
];
const dk = deriveDecidedBonus(knockout);
assert('q12 lengste øynasjon = Japan (QF)', (dk.q12 as { answer: string[] }).answer.join(','), 'Japan');
assert('q14 lengste afrikanske = Marokko (SF)', (dk.q14 as { answer: string[] }).answer.join(','), 'Marokko');
assert('q17 Norge = Sekstendelsfinaler', (dk.q17 as { answer: string }).answer, 'Sekstendelsfinaler');

// Ny regel: låses så snart alle kandidatene er ute – uten å vente på finalen.
// Alle øynasjoner ute i R32 (tapte) → q12 avgjort nå, begge deler «lengst» (R32).
const islandsOut = [
  mk({ stage: 'ROUND_OF_32', homeTeam: 'Japan', awayTeam: 'Spain', homeGoals: 0, awayGoals: 1, status: 'FINISHED', utcDate: '2026-07-01T18:00:00Z' }),
  mk({ stage: 'ROUND_OF_32', homeTeam: 'Australia', awayTeam: 'Brazil', homeGoals: 0, awayGoals: 2, status: 'FINISHED', utcDate: '2026-07-02T18:00:00Z' }),
  mk({ stage: 'ROUND_OF_16', homeTeam: 'Argentina', awayTeam: 'Germany', status: 'TIMED', utcDate: '2026-07-06T18:00:00Z' }), // ikke-øynasjon, R16 pågår
];
assert('q12 låst når alle øynasjoner ute (uten finale)',
  (deriveDecidedBonus(islandsOut).q12 as { answer: string[] }).answer.slice().sort().join(','), 'Australia,Japan');

// Fortsatt med: en øynasjon har en gjenstående kamp → q12 ikke avgjort.
const islandAlive = [
  mk({ stage: 'ROUND_OF_32', homeTeam: 'Japan', awayTeam: 'Spain', homeGoals: 0, awayGoals: 1, status: 'FINISHED', utcDate: '2026-07-01T18:00:00Z' }),
  mk({ stage: 'ROUND_OF_16', homeTeam: 'Australia', awayTeam: 'Brazil', status: 'TIMED', utcDate: '2026-07-06T18:00:00Z' }),
];
assert('q12 ikke satt mens en øynasjon fortsatt er med', deriveDecidedBonus(islandAlive).q12, undefined);

// Fortsatt med via seier: vant siste sluttspillkamp, neste slot ikke fylt (TBD) → fortsatt med.
const islandWonWaiting = [
  mk({ stage: 'ROUND_OF_16', homeTeam: 'Australia', awayTeam: 'Brazil', homeGoals: 1, awayGoals: 0, winner: 'HOME_TEAM', status: 'FINISHED', utcDate: '2026-07-06T18:00:00Z' }),
];
assert('q12 ikke satt når øynasjon vant siste kamp (venter på ny slot)', deriveDecidedBonus(islandWonWaiting).q12, undefined);
// q17-scoring: parseStage robust mot format
const q17q = BONUS_QUESTIONS.find((q) => q.id === 'q17')!;
const q17p: Participant[] = [
  { name: 'A', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'q17', answer: 'Kvartfinale' }] },
  { name: 'B', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'q17', answer: 'Gruppespill' }] },
];
assert('q17 «Kvartfinale» mot «Kvartfinaler» = full pott', scoreBonusQuestion(q17p, { ...q17q, answer: 'Kvartfinaler' }).get('A'), q17q.maxPoints);
assert('q17 feil runde = 0', scoreBonusQuestion(q17p, { ...q17q, answer: 'Kvartfinaler' }).get('B') ?? 0, 0);

// 4f) Feilstaving-toleranse i scoring (norm/spellKey)
console.log('\nFeilstaving gir riktig poeng:');
const q10q = BONUS_QUESTIONS.find((q) => q.id === 'q10')!;
const spellP: Participant[] = [
  { name: 'Bent', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'q10', answer: 'Curacau' }] },
  { name: 'Curaco', groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'q10', answer: 'Curacao' }] },
];
assert('q10 «Curacau» mot fasit «Curaçao» = full pott', scoreBonusQuestion(spellP, { ...q10q, answer: 'Curaçao' }).get('Bent'), q10q.maxPoints);
assert('q10 «Curacao» mot «Curaçao» = full pott', scoreBonusQuestion(spellP, { ...q10q, answer: 'Curaçao' }).get('Curaco'), q10q.maxPoints);

// 4g) Admin-opprettede krydderspørsmål (q.scoring-modus) + mergeCustomBonusTips
console.log('\nCustom krydder (scoring-modus):');
const cParts: Participant[] = [
  { name: 'A', groupTips: [], bonusTips: [], knockoutTips: [] },
  { name: 'B', groupTips: [], bonusTips: [], knockoutTips: [] },
];
// Flett admin-svar inn i bonusTips (slik App.tsx gjør), så de scores som vanlig krydder.
const cMerged = mergeCustomBonusTips(cParts, {
  A: { k1: 'Brasil', k2: '50', k3: 'Norge', k4: ['Norge', 'Brasil'] },
  B: { k1: 'brasil', k2: '60', k3: 'Sverige', k4: ['Norge', 'Danmark'] },
});
assert('mergeCustomBonusTips la til 4 svar for A', cMerged[0].bonusTips.length, 4);

const exactQ: BonusQuestion = { id: 'k1', question: 'Vinner?', maxPoints: 5, answer: 'Brasil', scoring: 'exact', custom: true };
assert('custom exact: riktig (case-insensitiv) = 5p', scoreBonusQuestion(cMerged, exactQ).get('B'), 5);
assert('custom exact: feil = 0p', scoreBonusQuestion(cMerged, { ...exactQ, answer: 'Argentina' }).get('A') ?? 0, 0);

const numQ: BonusQuestion = { id: 'k2', question: 'Antall?', maxPoints: 2, answer: '52', scoring: 'number', margin: 5, custom: true };
assert('custom number: innenfor ±5 = 2p', scoreBonusQuestion(cMerged, numQ).get('A'), 2); // 50 vs 52
assert('custom number: utenfor ±5 = 0p', scoreBonusQuestion(cMerged, numQ).get('B') ?? 0, 0); // 60 vs 52

const listQ: BonusQuestion = { id: 'k3', question: 'Land?', maxPoints: 3, answer: ['Norge', 'Island'], scoring: 'list', custom: true };
assert('custom list: svar i lista = full pott', scoreBonusQuestion(cMerged, listQ).get('A'), 3);
assert('custom list: svar ikke i lista = 0p', scoreBonusQuestion(cMerged, listQ).get('B') ?? 0, 0);

const perItemQ: BonusQuestion = { id: 'k4', question: 'To land?', maxPoints: 4, answer: ['Norge', 'Brasil'], scoring: 'perItem', perItemPoints: 2, custom: true };
assert('custom perItem: begge riktige = 4p', scoreBonusQuestion(cMerged, perItemQ).get('A'), 4);
assert('custom perItem: ett riktig = 2p', scoreBonusQuestion(cMerged, perItemQ).get('B'), 2);
assert('custom perItem: cap på maxPoints', scoreBonusQuestion(cMerged, { ...perItemQ, perItemPoints: 3 }).get('A'), 4);
// Tom fasit → 0 for alle (ikke avgjort ennå).
assert('custom uten fasit = 0p', scoreBonusQuestion(cMerged, { ...exactQ, answer: null }).get('A'), 0);

// 5) Full stilling – sanity
console.log('\nStilling (kun gruppespill, 4 kjente resultater):');
for (const s of standings) {
  console.log(`  #${s.rank} ${s.name.padEnd(8)} total=${s.total} (gruppe ${s.groupPoints}, krydder ${s.bonusPoints})`);
}

console.log(failures === 0 ? '\nAlle tester OK ✓' : `\n${failures} test(er) FEILET`);
process.exit(failures === 0 ? 0 : 1);
