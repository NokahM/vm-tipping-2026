import type { BonusQuestion, MatchResult, Participant } from '../types';
import { computeStandings, matchDayKey } from './scoring';

/** Datoer for en krydder-fasit (til grafen): hele spørsmålet og/eller per lag/element. */
export interface BonusDateInfo {
  at?: string; // ISO – når hele spørsmålet ble avgjort (enkelt-svar)
  ats?: Record<string, string>; // lag/element → ISO (liste-spørsmål)
}

export interface ProgressionSeries {
  name: string;
  totals: number[]; // kumulativ totalsum ved hver dag i `days`
  final: number; // = totals[siste]
}

export interface Progression {
  days: string[]; // sorterte matchday-nøkler (YYYY-MM-DD), 10:00 UTC-grense
  series: ProgressionSeries[]; // sortert på final (synkende), så topp-N = de N første
}

/** Dagen før (YYYY-MM-DD) – brukes til «start»-punktet der alle står på 0. */
function dayBefore(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Kumulativ poengutvikling per deltaker, dag for dag (samme 10:00 UTC / 12:00 norsk-grense
 * som plasserings-pilene). Kamp-poeng bøttes til kampens matchday. Krydder-poeng bøttes til
 * sin «avgjort»-dato: enkelt-svar via `at`, og liste-spørsmål **per lag/element** via `ats`
 * (så hvert selvmål/rødt kort/kjendis tikker inn på sin egen dag). Udatert → siste dag som
 * fallback. Kun FINISHED/avgjort teller (aldri live), akkurat som tabellen.
 */
export function computeProgression(
  participants: Participant[],
  results: MatchResult[],
  questions: BonusQuestion[],
  bonusInfo: Record<string, BonusDateInfo>,
): Progression {
  const finished = results.filter(
    (m) => m.status === 'FINISHED' && m.homeGoals !== null && m.awayGoals !== null,
  );
  const matchDays = [...new Set(finished.map((m) => matchDayKey(m.utcDate)))].sort();
  const fallbackDay = matchDays.length
    ? matchDays[matchDays.length - 1]
    : matchDayKey(new Date().toISOString());

  // Avgjort-dag for ett liste-element (eller hele enkelt-spørsmålet hvis item utelates).
  const dayOf = (qid: string, item?: string): string => {
    const info = bonusInfo[qid];
    const raw = (item !== undefined ? info?.ats?.[item] : undefined) ?? info?.at;
    return raw ? matchDayKey(raw) : fallbackDay;
  };

  const answered = questions.filter((q) => q.answer !== null);

  // Alle hendelsesdager (kamper + hvert krydder-element).
  const bonusDays: string[] = [];
  for (const q of answered) {
    if (Array.isArray(q.answer)) for (const item of q.answer) bonusDays.push(dayOf(q.id, item));
    else bonusDays.push(dayOf(q.id));
  }
  const days = [...new Set([...matchDays, ...bonusDays])].sort();

  if (days.length === 0) {
    return { days: [], series: participants.map((p) => ({ name: p.name, totals: [], final: 0 })) };
  }

  const totalsByName = new Map<string, number[]>(participants.map((p) => [p.name, []]));
  for (const day of days) {
    const resAsOf = finished.filter((m) => matchDayKey(m.utcDate) <= day);
    const qAsOf = questions.map((q) => {
      if (q.answer === null) return q;
      if (Array.isArray(q.answer)) {
        // Liste: behold kun elementene som er avgjort t.o.m. denne dagen.
        const items = q.answer.filter((item) => dayOf(q.id, item) <= day);
        return items.length ? { ...q, answer: items } : { ...q, answer: null };
      }
      return dayOf(q.id) <= day ? q : { ...q, answer: null };
    });
    const byName = new Map(computeStandings(participants, resAsOf, qAsOf).map((s) => [s.name, s.total]));
    for (const p of participants) totalsByName.get(p.name)!.push(byName.get(p.name) ?? 0);
  }

  // «Start»-dag (dagen før første kampdag) der alle står på 0, så linjene stiger fra 0.
  const startDay = dayBefore(days[0]);
  const series: ProgressionSeries[] = participants.map((p) => {
    const totals = [0, ...totalsByName.get(p.name)!];
    return { name: p.name, totals, final: totals[totals.length - 1] ?? 0 };
  });
  series.sort((a, b) => b.final - a.final || a.name.localeCompare(b.name, 'no'));
  return { days: [startDay, ...days], series };
}
