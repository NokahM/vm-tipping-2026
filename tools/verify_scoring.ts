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
  participantBreakdown,
} from '../apps/drammen/src/utils/scoring';
import { normalizeTeamName } from '../apps/drammen/src/utils/teamNames';
import { applyBonusAnswers, mergeKnockoutTips } from '../apps/drammen/src/utils/storage';
import { reconcileResults } from '../apps/drammen/src/utils/reconcile';
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
  if (q.id === 'q5') return { ...q, answer: '300' }; // nærmest: Tore 299 (d=1)
  if (q.id === 'q6') return { ...q, answer: '00:34' }; // ±15s: Erling 00:35
  if (q.id === 'q7') return { ...q, answer: ['Nederland', 'Irak'] }; // Erling traff Nederland
  return q;
});
const withBonus = computeStandings(PARTICIPANTS, results, fasit);
const find = (n: string) => withBonus.find((s) => s.name === n)!;
console.log('Krydderpoeng (syntetisk fasit):');
// Erling: q1 Frankrike +5, q6 00:35 +2, q7 Nederland +1 = 8
assert('Erling bonus', find('Erling').bonusPoints, 8);
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

// 5) Full stilling – sanity
console.log('\nStilling (kun gruppespill, 4 kjente resultater):');
for (const s of standings) {
  console.log(`  #${s.rank} ${s.name.padEnd(8)} total=${s.total} (gruppe ${s.groupPoints}, krydder ${s.bonusPoints})`);
}

console.log(failures === 0 ? '\nAlle tester OK ✓' : `\n${failures} test(er) FEILET`);
process.exit(failures === 0 ? 0 : 1);
