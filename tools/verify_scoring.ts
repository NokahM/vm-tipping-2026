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
  projectTotalGoals,
  scoreBonusQuestion,
} from '../apps/drammen/src/utils/scoring';
import { computeProgression } from '../apps/drammen/src/utils/progression';
import { normalizeTeamName } from '../apps/drammen/src/utils/teamNames';
import { applyBonusAnswers, mergeKnockoutTips } from '../apps/drammen/src/utils/storage';
import { reconcileResults } from '../apps/drammen/src/utils/reconcile';
import { deriveDecidedBonus, deriveStatsBonus } from '../apps/drammen/src/utils/autoDerive';
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
const mkP = (name: string, goals: string): Participant =>
  ({ name, groupTips: [], knockoutTips: [], bonusTips: [{ questionId: 'q5', answer: goals }] }) as Participant;
const q5score = scoreBonusQuestion(
  [mkP('A', '305'), mkP('B', '295'), mkP('C', '306'), mkP('D', '294')],
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
// q1: finale ferdig (ikke uavgjort)
const withFinal = [
  mk({ stage: 'FINAL', homeTeam: 'France', awayTeam: 'Brazil', homeGoals: 2, awayGoals: 1, status: 'FINISHED', utcDate: '2026-07-19T18:00:00Z' }),
];
assert('q1 = finalevinner (Frankrike)', (deriveDecidedBonus(withFinal).q1 as { answer: string }).answer, 'Frankrike');
// q1: uavgjort finale (straffer) → ikke auto
const drawFinal = [mk({ stage: 'FINAL', homeTeam: 'France', awayTeam: 'Brazil', homeGoals: 1, awayGoals: 1, status: 'FINISHED' })];
assert('q1 ikke satt ved uavgjort finale', deriveDecidedBonus(drawFinal).q1, undefined);

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
const q3store = deriveStatsBonus({ ...baseStats, topScorers: [
  { id: 1, name: 'Kylian Mbappe', team: 'France', position: '', goals: 8 },
  { id: 2, name: 'Harry Kane', team: 'England', position: '', goals: 6 },
] }, overResults);
assert('q3 inkluderer toppscorer-etternavn', (q3store.q3 as { answer: string[] }).answer.includes('Mbappe'), true);
assert('q3 ikke satt før turnering ferdig', deriveStatsBonus({ ...baseStats, topScorers: [{ id: 1, name: 'X', team: 'Y', position: '', goals: 3 }] }, []).q3, undefined);
const q13store = deriveStatsBonus({ ...baseStats, goalsByPlayer: { '44': 3, '3218': 1 } }, overResults);
assert('q13 = Ronaldo når flest', (q13store.q13 as { answer: string[] }).answer.includes('Ronaldo'), true);
assert('q13 ikke Messi når færre', (q13store.q13 as { answer: string[] }).answer.includes('Messi'), false);

// 5) Full stilling – sanity
console.log('\nStilling (kun gruppespill, 4 kjente resultater):');
for (const s of standings) {
  console.log(`  #${s.rank} ${s.name.padEnd(8)} total=${s.total} (gruppe ${s.groupPoints}, krydder ${s.bonusPoints})`);
}

console.log(failures === 0 ? '\nAlle tester OK ✓' : `\n${failures} test(er) FEILET`);
process.exit(failures === 0 ? 0 : 1);
