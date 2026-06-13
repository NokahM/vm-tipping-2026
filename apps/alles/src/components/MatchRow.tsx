import { useState } from 'react';
import type { MatchResult, Participant } from '../types';
import { normalizeTeamName } from '../utils/teamNames';
import { formatKickoff } from '../utils/labels';
import TipChips from './TipChips';

interface Props {
  match: MatchResult;
  participants: Participant[];
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

        {live && <span className="text-[11px] font-semibold text-red-400">● LIVE</span>}

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
        <div className="px-3 pb-2.5">
          <TipChips match={match} participants={participants} />
        </div>
      )}
    </li>
  );
}
