import type { BonusQuestion, MatchResult, Participant } from '../types';
import { computeStandings, matchDayKey } from './scoring';

/** Krydder-fasit sin «avgjort»-dato (ISO-streng), nøklet på questionId. Brukes kun til grafen. */
export type BonusDates = Record<string, string>;

export interface ProgressionSeries {
  name: string;
  totals: number[]; // kumulativ totalsum ved hver dag i `days`
  final: number; // = totals[siste]
}

export interface Progression {
  days: string[]; // sorterte matchday-nøkler (YYYY-MM-DD), 10:00 UTC-grense
  series: ProgressionSeries[]; // sortert på final (synkende), så topp-N = de N første
}

/**
 * Kumulativ poengutvikling per deltaker, dag for dag (samme 10:00 UTC / 12:00 norsk-grense
 * som plasserings-pilene). Kampe-poeng bøttes til kampens matchday; krydder-poeng til
 * `bonusDates[qid]` sin matchday – eller siste dag som fallback hvis fasiten ikke er datert.
 * Kun FINISHED/avgjort teller (aldri live), akkurat som tabellen.
 */
export function computeProgression(
  participants: Participant[],
  results: MatchResult[],
  questions: BonusQuestion[],
  bonusDates: BonusDates,
): Progression {
  const finished = results.filter(
    (m) => m.status === 'FINISHED' && m.homeGoals !== null && m.awayGoals !== null,
  );
  const matchDays = [...new Set(finished.map((m) => matchDayKey(m.utcDate)))].sort();
  const fallbackDay = matchDays.length
    ? matchDays[matchDays.length - 1]
    : matchDayKey(new Date().toISOString());

  const answered = questions.filter((q) => q.answer !== null);
  const bonusDay = (qid: string): string =>
    bonusDates[qid] ? matchDayKey(bonusDates[qid]) : fallbackDay;

  const days = [
    ...new Set([...matchDays, ...answered.map((q) => bonusDay(q.id))]),
  ].sort();

  if (days.length === 0) {
    return { days: [], series: participants.map((p) => ({ name: p.name, totals: [], final: 0 })) };
  }

  // For hver dag: standings beregnet på data t.o.m. den dagen.
  const totalsByName = new Map<string, number[]>(participants.map((p) => [p.name, []]));
  for (const day of days) {
    const resAsOf = finished.filter((m) => matchDayKey(m.utcDate) <= day);
    const qAsOf = questions.map((q) =>
      q.answer !== null && bonusDay(q.id) <= day ? q : { ...q, answer: null },
    );
    const standings = computeStandings(participants, resAsOf, qAsOf);
    const byName = new Map(standings.map((s) => [s.name, s.total]));
    for (const p of participants) totalsByName.get(p.name)!.push(byName.get(p.name) ?? 0);
  }

  const series: ProgressionSeries[] = participants.map((p) => {
    const totals = totalsByName.get(p.name)!;
    return { name: p.name, totals, final: totals[totals.length - 1] ?? 0 };
  });
  series.sort((a, b) => b.final - a.final || a.name.localeCompare(b.name, 'no'));
  return { days, series };
}
