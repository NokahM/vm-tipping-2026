import type { MatchResult, Participant } from '../types';
import { pointsForTip, tipForMatch } from '../utils/scoring';

interface Props {
  match: MatchResult;
  participants: Participant[];
}

function pointClasses(points: number | null): string {
  if (points === 3) return 'border-emerald-600/40 bg-emerald-500/15 text-emerald-300';
  if (points === 1) return 'border-amber-600/40 bg-amber-500/15 text-amber-300';
  if (points === 0) return 'border-red-700/40 bg-red-500/15 text-red-300';
  return 'border-slate-600/40 bg-slate-700/30 text-slate-300';
}

/** Rutenett med alle deltakeres tips for en kamp, fargekodet etter poeng. */
export default function TipChips({ match, participants }: Props) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {participants.map((p) => {
        const tip = tipForMatch(p, match);
        const pts = tip ? pointsForTip(tip, match) : null;
        return (
          <div
            key={p.name}
            className={`rounded border px-2 py-1 text-xs ${
              tip ? pointClasses(pts) : 'border-slate-700/40 bg-slate-800/40 text-slate-500'
            }`}
          >
            <span className="block truncate font-medium">{p.name}</span>
            <span className="tabular-nums">
              {tip ? `${tip.home}–${tip.away}` : 'ingen tips'}
              {pts !== null && <span className="opacity-70"> · {pts}p</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
