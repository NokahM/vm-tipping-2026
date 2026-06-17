import { useMemo, useState } from 'react';
import type { BonusQuestion, MatchResult, Participant } from '../types';
import { participantBreakdown, type ScoringItem } from '../utils/scoring';
import { roundDatasets, type BonusDateInfo, type Progression } from '../utils/progression';
import { wcFrameStyle } from '../utils/wcFrame';

const MONTHS = ['jan.', 'feb.', 'mars', 'apr.', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];

/** YYYY-MM-DD → «12. juni». */
function dayLabel(ymd: string): string {
  const [, mm, dd] = ymd.split('-');
  return `${Number(dd)}. ${MONTHS[Number(mm) - 1] ?? mm}`;
}

interface Round {
  name: string;
  day: string;
  points: number;
  max: number; // maks mulige poeng den runden (alle kamper + krydder avgjort den dagen)
}

const PER_TEAM = new Set(['q7', 'q8']); // 2p per nevnt lag (rødt kort / selvmål)

/** Maks oppnåelige poeng for én runde: 3p per kamp + krydder-maks avgjort den dagen. */
function maxForRound(ds: { results: MatchResult[]; questions: BonusQuestion[] }): number {
  let max = 3 * ds.results.length;
  for (const q of ds.questions) {
    if (q.answer === null) continue;
    max += PER_TEAM.has(q.id)
      ? Math.min(2 * (Array.isArray(q.answer) ? q.answer.length : 1), q.maxPoints)
      : q.maxPoints;
  }
  return max;
}

function BreakdownChip({ item }: { item: ScoringItem }) {
  const color =
    item.points === 1
      ? 'border-amber-600/40 bg-amber-500/15 text-amber-300'
      : 'border-emerald-600/40 bg-emerald-500/15 text-emerald-300';

  if (item.kind === 'match') {
    return (
      <div className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${color}`}>
        <span className="min-w-0 flex-1 truncate">{item.home}</span>
        <span className="shrink-0 font-bold tabular-nums">{item.result}</span>
        <span className="min-w-0 flex-1 truncate text-right">{item.away}</span>
        <span className="shrink-0 font-bold tabular-nums">+{item.points}</span>
      </div>
    );
  }

  return (
    <div className={`rounded border px-2 py-1 text-xs ${color}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">{item.question}</span>
        <span className="shrink-0 font-bold tabular-nums">+{item.points}</span>
      </div>
      {item.answer && <span className="block truncate text-[11px] opacity-80">{item.answer}</span>}
    </div>
  );
}

/**
 * «Beste runde»: de 5 sterkeste enkelt-rundene (én matchday) på tvers av alle deltakere.
 * En rundes poeng = differansen i en deltakers kumulative total mellom to påfølgende dager
 * i `progression` (inkluderer både kamp- og krydderpoeng avgjort den runden). Kun
 * FINISHED/avgjort teller, akkurat som tabellen. Trykk på en rad → hvor poengene kom fra.
 */
export default function BestRounds({
  progression,
  participants,
  results,
  questions,
  bonusInfo,
}: {
  progression: Progression;
  participants: Participant[];
  results: MatchResult[];
  questions: BonusQuestion[];
  bonusInfo: Record<string, BonusDateInfo>;
}) {
  const frameStyle = useMemo(wcFrameStyle, []);
  const [open, setOpen] = useState<number | null>(null);

  const top = useMemo<Round[]>(() => {
    const { days, series } = progression;
    const rounds: Omit<Round, 'max'>[] = [];
    for (const s of series) {
      // days[0] er syntetisk «start»-dag (alle på 0); ekte runder starter på index 1.
      for (let i = 1; i < s.totals.length; i++) {
        const points = s.totals[i] - s.totals[i - 1];
        if (points > 0) rounds.push({ name: s.name, day: days[i], points });
      }
    }
    rounds.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'no'));
    // Maks beregnes kun for de 5 vi viser (roundDatasets per runde).
    const dayMax = new Map<string, number>();
    return rounds.slice(0, 5).map((r) => {
      if (!dayMax.has(r.day)) {
        dayMax.set(r.day, maxForRound(roundDatasets(r.day, results, questions, bonusInfo)));
      }
      return { ...r, max: dayMax.get(r.day)! };
    });
  }, [progression, results, questions, bonusInfo]);

  const maxPoints = Math.max(1, ...top.map((r) => r.points));

  const breakdown = useMemo<ScoringItem[]>(() => {
    if (open === null) return [];
    const r = top[open];
    const p = participants.find((x) => x.name === r.name);
    if (!p) return [];
    const ds = roundDatasets(r.day, results, questions, bonusInfo);
    return participantBreakdown(p, participants, ds.results, ds.questions);
  }, [open, top, participants, results, questions, bonusInfo]);

  return (
    <div style={frameStyle} className="wc-frame overflow-hidden rounded-xl bg-slate-800">
      <div className="border-b border-slate-700/70 px-3 py-1.5 text-sm font-semibold text-slate-200">
        Beste runde
      </div>
      {top.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-500">Ingen ferdigspilte runder ennå.</p>
      ) : (
        <ul className="space-y-1.5 px-3 py-2.5">
          {top.map((r, i) => (
            <li key={`${r.name}-${r.day}`}>
              <button
                type="button"
                onClick={() => setOpen((v) => (v === i ? null : i))}
                className="flex w-full items-center gap-2 text-left text-[11px] active:opacity-70"
                aria-expanded={open === i}
              >
                <span className="w-4 shrink-0 text-right font-semibold tabular-nums text-slate-500">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-slate-200">{r.name}</span>
                    <span className="shrink-0 tabular-nums text-slate-400">
                      {dayLabel(r.day)} ·{' '}
                      <span className="font-semibold text-wc-lime">{r.points}</span>
                      <span className="text-slate-500"> av {r.max} mulige</span>
                    </span>
                  </div>
                  <div className="mt-1 flex h-2.5 overflow-hidden rounded bg-slate-900/70">
                    <div className="bg-wc-lime" style={{ width: `${(r.points / maxPoints) * 100}%` }} />
                  </div>
                </div>
              </button>

              {open === i && (
                <div className="mt-1.5 grid grid-cols-1 gap-1.5 pl-6 sm:grid-cols-2">
                  {breakdown.length === 0 ? (
                    <p className="rounded border border-slate-700/40 bg-slate-800/40 px-2 py-1.5 text-xs text-slate-500">
                      Ingen poenggivende treff denne runden.
                    </p>
                  ) : (
                    breakdown.map((item, j) => <BreakdownChip key={j} item={item} />)
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="px-3 pb-2 text-center text-[10px] text-slate-600">Trykk på en runde for detaljer</p>
    </div>
  );
}
