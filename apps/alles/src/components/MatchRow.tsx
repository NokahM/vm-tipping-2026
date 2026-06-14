import { useState } from 'react';
import type { MatchResult, Participant } from '../types';
import { normalizeTeamName } from '../utils/teamNames';
import { formatKickoff } from '../utils/labels';
import TeamLogo from './TeamLogo';
import TipChips from './TipChips';
import BroadcasterBadge from './BroadcasterBadge';

interface Props {
  match: MatchResult;
  participants: Participant[];
}

/**
 * Én kamprad: logo · hjemmelag · stilling · bortelag · logo. Klikkbar for å vise
 * alles tips. Når kampen ikke har startet vises dato + klokkeslett i stedet for stilling.
 */
export default function MatchRow({ match, participants }: Props) {
  const [open, setOpen] = useState(false);

  const live = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const played = match.status === 'FINISHED' || live;
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
        {/* Hjemmelag: logo + navn */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TeamLogo name={home} className="h-6 w-6" />
          <span className="truncate text-sm text-slate-100">{home}</span>
        </div>

        {/* Stilling alltid sentrert; LIVE legges absolutt rett etter uten å flytte stillingen */}
        <div className="relative flex shrink-0 items-center justify-center px-1 leading-tight">
          {played ? (
            <span className="text-sm font-bold tabular-nums text-slate-100">
              {match.homeGoals}
              <span className="px-0.5 text-slate-500">–</span>
              {match.awayGoals}
            </span>
          ) : (
            <span className="text-xs tabular-nums text-slate-400">{formatKickoff(match.utcDate)}</span>
          )}
          {!played && (
            <span className="absolute left-full top-1/2 ml-1.5 flex -translate-y-1/2 items-center">
              <BroadcasterBadge apiId={match.apiId} className="h-3.5" />
            </span>
          )}
          {live && (
            <span
              className="absolute left-full top-1/2 ml-1.5 -translate-y-1/2 text-[10px] text-red-400"
              title="Live"
              aria-label="Live"
            >
              ●
            </span>
          )}
        </div>

        {/* Bortelag: navn + logo */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="truncate text-right text-sm text-slate-100">{away}</span>
          <TeamLogo name={away} className="h-6 w-6" />
        </div>
      </button>

      {open && (
        <div className="px-3 pb-2.5">
          <TipChips match={match} participants={participants} />
        </div>
      )}
    </li>
  );
}
