import { useState } from 'react';
import type { MatchResult, Participant } from '../types';
import { normalizeTeamName } from '../utils/teamNames';
import { formatKickoff } from '../utils/labels';
import TeamLogo from './TeamLogo';
import TipChips from './TipChips';
import MatchEvents from './MatchEvents';
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

  // Avspark kan ha vært selv om football-data.org henger etter med å flippe status til
  // IN_PLAY – regn kampen som «live» når avsparkstidspunktet har passert og den ikke er ferdig.
  const liveNow =
    match.status === 'IN_PLAY' ||
    match.status === 'PAUSED' ||
    (Date.parse(match.utcDate) <= Date.now() && match.status !== 'FINISHED');
  const hasScore = match.homeGoals != null && match.awayGoals != null;
  const played = match.status === 'FINISHED' || (liveNow && hasScore);
  const home = normalizeTeamName(match.homeTeam);
  const away = normalizeTeamName(match.awayTeam);

  // Kampklokke fra API-et (oppdateres ved polling). PAUSE = «Pause», ellers minutt (+ tilleggstid).
  const liveLabel =
    match.status === 'PAUSED'
      ? 'Pause'
      : match.minute != null
        ? `${match.minute}${match.injuryTime ? `+${match.injuryTime}` : ''}'`
        : 'LIVE';

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

        {/* Stilling sentrert; kampklokka stables under (skifter ikke horisontal plassering) */}
        <div className="flex shrink-0 flex-col items-center justify-center px-1 leading-tight">
          {played ? (
            <span className="text-sm font-bold tabular-nums text-slate-100">
              {match.homeGoals}
              <span className="px-0.5 text-slate-500">–</span>
              {match.awayGoals}
            </span>
          ) : (
            <span className="text-xs tabular-nums text-slate-400">{formatKickoff(match.utcDate)}</span>
          )}
          {liveNow && (
            <span
              className="whitespace-nowrap text-[9px] font-semibold tabular-nums text-red-400"
              aria-label="Live"
            >
              <span className="animate-pulse">●</span> {liveLabel}
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
          {/* Kanal vises ikke for ferdigspilte kamper – ikke interessant lenger. */}
          {match.status !== 'FINISHED' && (
            <div className="mb-2 flex justify-center">
              <BroadcasterBadge apiId={match.apiId} className="h-4" />
            </div>
          )}
          <MatchEvents match={match} />
          <TipChips match={match} participants={participants} />
        </div>
      )}
    </li>
  );
}
