import { useState } from 'react';
import type { MatchResult, Participant } from '../types';
import { normalizeTeamName } from '../utils/teamNames';
import { pointsForTip, tipForMatch } from '../utils/scoring';
import { formatKickoff } from '../utils/labels';

interface Props {
  match: MatchResult;
  participants: Participant[];
}

function pointClasses(points: number | null): string {
  if (points === 3) return 'border-wc-lime/40 bg-wc-lime/15 text-wc-lime';
  if (points === 1) return 'border-wc-yellow/40 bg-wc-yellow/15 text-wc-yellow';
  if (points === 0) return 'border-wc-red/40 bg-wc-red/15 text-wc-red';
  return 'border-slate-600/40 bg-slate-700/30 text-slate-300';
}

export default function MatchRow({ match, participants }: Props) {
  const [open, setOpen] = useState(false);

  const played = match.status === 'FINISHED' || match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const live = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const home = normalizeTeamName(match.homeTeam);
  const away = normalizeTeamName(match.awayTeam);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left active:bg-slate-700/30"
        aria-expanded={open}
      >
        {/* Lagnavn – fast bredde slik at resultatet ligger inntil navnet */}
        <div className="w-40 shrink-0 sm:w-48">
          <p className="truncate text-sm text-slate-100">{home}</p>
          <p className="truncate text-sm text-slate-100">{away}</p>
        </div>

        {/* Resultat (eller klokkeslett) – klistret inntil lagnavnet */}
        <div className="w-8 shrink-0 text-center tabular-nums">
          {played ? (
            <>
              <p className="text-sm font-bold text-slate-100">{match.homeGoals}</p>
              <p className="text-sm font-bold text-slate-100">{match.awayGoals}</p>
            </>
          ) : (
            <p className="text-[11px] leading-tight text-slate-400">{formatKickoff(match.utcDate)}</p>
          )}
        </div>

        {live && <span className="text-[11px] font-semibold text-wc-red">● LIVE</span>}

        <svg
          className={`ml-auto h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="grid grid-cols-2 gap-1.5 px-3 pb-2.5 sm:grid-cols-3">
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
      )}
    </li>
  );
}
