import { useMemo, useState } from 'react';
import type { BonusQuestion, MatchResult, Participant, ParticipantScore } from '../types';
import { computeRankDeltas, participantBreakdown, type ScoringItem } from '../utils/scoring';
import { wcFrameStyle } from '../utils/wcFrame';

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

  const deltas = useMemo(
    () => computeRankDeltas(standings, participants, results, questions),
    [standings, participants, results, questions],
  );
  const frameStyle = useMemo(wcFrameStyle, []);

  return (
    <section style={frameStyle} className="wc-frame overflow-hidden rounded-xl bg-slate-800">
      <header className="flex items-center gap-2 border-b border-slate-700 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        <span className="w-5 text-center">#</span>
        <span className="flex-1">Navn</span>
        <span className="w-9 text-right">Sum</span>
      </header>

      <ul className="divide-y divide-slate-700/70">
        {standings.map((s) => (
          <LeaderboardRow
            key={s.name}
            score={s}
            delta={deltas.get(s.name)}
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
  delta,
  participant,
  participants,
  results,
  questions,
}: {
  score: ParticipantScore;
  delta: number | undefined;
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
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left active:bg-slate-700/30"
        aria-expanded={open}
      >
        <span
          className={`w-5 text-center font-bold tabular-nums ${RANK_COLOR[s.rank] ?? 'text-slate-500'}`}
        >
          {s.rank}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2.5 font-medium text-slate-100">
          <span className="min-w-0 truncate">{s.name}</span>
          <MovementArrow delta={delta} />
        </span>
        <span className="w-[4.5rem] shrink-0 text-center text-xs tabular-nums">
          <span className="text-emerald-400">{s.correctResults}</span>
          <span className="text-slate-600"> · </span>
          <span className="text-amber-400">{s.correctOutcomes}</span>
          <span className="text-slate-600"> · </span>
          <span className="text-red-400">{s.wrongOutcomes}</span>
        </span>
        <span className="ml-1 w-9 text-right text-lg font-bold leading-none tabular-nums text-white [text-shadow:0_0_3px_rgb(0_0_0/0.9)]">
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

function MovementArrow({ delta }: { delta: number | undefined }) {
  if (!delta) {
    return (
      <span className="shrink-0 text-xs text-slate-600" aria-label="Ingen endring">
        –
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`shrink-0 text-xs font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}
      aria-label={up ? `Opp ${delta} plasser` : `Ned ${-delta} plasser`}
    >
      <span className="text-[10px]">{up ? '▲' : '▼'}</span>
      {Math.abs(delta)}
    </span>
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
