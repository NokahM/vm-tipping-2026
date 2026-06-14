import { useMemo, useState } from 'react';
import type { BonusQuestion, MatchResult, Participant, ParticipantScore } from '../types';
import { participantBreakdown, type ScoringItem } from '../utils/scoring';

interface Props {
  standings: ParticipantScore[];
  participants: Participant[];
  results: MatchResult[];
  questions: BonusQuestion[];
}

const RANK_COLOR: Record<number, string> = {
  1: 'text-amber-300',
  2: 'text-slate-300',
  3: 'text-orange-400',
};

export default function Leaderboard({ standings, participants, results, questions }: Props) {
  const byName = useMemo(
    () => new Map(participants.map((p) => [p.name, p])),
    [participants],
  );

  return (
    <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
      <header className="flex items-center gap-2 border-b border-slate-700 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        <span className="w-5 text-center">#</span>
        <span className="flex-1">Navn</span>
        <span className="hidden w-9 text-right sm:block">Grp</span>
        <span className="hidden w-9 text-right sm:block">Slutt</span>
        <span className="hidden w-9 text-right sm:block">Bon</span>
        <span className="hidden w-[4.5rem] text-right sm:block" title="Eksakt · utfall · feil">
          Treff
        </span>
        <span className="w-9 text-right">Sum</span>
      </header>

      <ul className="divide-y divide-slate-700/70">
        {standings.map((s) => (
          <LeaderboardRow
            key={s.name}
            score={s}
            participant={byName.get(s.name)}
            participants={participants}
            results={results}
            questions={questions}
          />
        ))}
      </ul>
    </section>
  );
}

function LeaderboardRow({
  score: s,
  participant,
  participants,
  results,
  questions,
}: {
  score: ParticipantScore;
  participant: Participant | undefined;
  participants: Participant[];
  results: MatchResult[];
  questions: BonusQuestion[];
}) {
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () => (open && participant ? participantBreakdown(participant, participants, results, questions) : []),
    [open, participant, participants, results, questions],
  );

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-slate-700/30"
        aria-expanded={open}
      >
        <span
          className={`w-5 text-center font-bold tabular-nums ${RANK_COLOR[s.rank] ?? 'text-slate-500'}`}
        >
          {s.rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-100">{s.name}</p>
          <p className="text-xs text-slate-500 sm:hidden">
            G {s.groupPoints} · S {s.knockoutPoints} · B {s.bonusPoints}
            <span className="ml-2 tabular-nums">
              <span className="text-emerald-400">{s.correctResults}</span>
              <span className="text-slate-600"> · </span>
              <span className="text-amber-400">{s.correctOutcomes}</span>
              <span className="text-slate-600"> · </span>
              <span className="text-red-400">{s.wrongOutcomes}</span>
            </span>
          </p>
        </div>
        <span className="hidden w-9 text-right text-sm text-slate-400 tabular-nums sm:block">
          {s.groupPoints}
        </span>
        <span className="hidden w-9 text-right text-sm text-slate-400 tabular-nums sm:block">
          {s.knockoutPoints}
        </span>
        <span className="hidden w-9 text-right text-sm text-slate-400 tabular-nums sm:block">
          {s.bonusPoints}
        </span>
        <span className="hidden w-[4.5rem] text-right text-sm tabular-nums sm:block">
          <span className="text-emerald-400">{s.correctResults}</span>
          <span className="text-slate-600"> · </span>
          <span className="text-amber-400">{s.correctOutcomes}</span>
          <span className="text-slate-600"> · </span>
          <span className="text-red-400">{s.wrongOutcomes}</span>
        </span>
        <span className="w-9 text-right text-lg font-bold tabular-nums text-emerald-400">
          {s.total}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-2.5">
          {items.length === 0 ? (
            <p className="rounded border border-slate-700/40 bg-slate-800/40 px-2 py-1.5 text-xs text-slate-500">
              Ingen poeng ennå.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {items.map((item, i) => (
                <BreakdownChip key={i} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
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
