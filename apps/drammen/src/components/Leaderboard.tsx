import type { ParticipantScore } from '../types';

interface Props {
  standings: ParticipantScore[];
}

const RANK_COLOR: Record<number, string> = {
  1: 'text-amber-300',
  2: 'text-slate-300',
  3: 'text-orange-400',
};

export default function Leaderboard({ standings }: Props) {
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
          <li key={s.name} className="flex items-center gap-2 px-3 py-2.5">
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
          </li>
        ))}
      </ul>
    </section>
  );
}
