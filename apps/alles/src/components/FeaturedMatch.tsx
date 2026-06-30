import { useState } from 'react';
import type { MatchResult, Participant } from '../types';
import { normalizeTeamName } from '../utils/teamNames';
import { formatKickoff, extraTimeResult } from '../utils/labels';
import TeamLogo from './TeamLogo';
import TipChips from './TipChips';
import MatchEvents from './MatchEvents';
import BroadcasterBadge from './BroadcasterBadge';

interface Props {
  match: MatchResult;
  participants: Participant[];
}

/**
 * Fremhevet «Aktuell kamp»-kort: live-kampen nå, ellers neste kommende.
 * Layout: <logo> lag  stilling  lag <logo>. Klikkbart for å vise alles tips.
 */
export default function FeaturedMatch({ match, participants }: Props) {
  const [open, setOpen] = useState(false);

  // Avspark kan ha vært selv om football-data.org henger etter med å flippe status til
  // IN_PLAY – regn kampen som «live» når avsparkstidspunktet har passert og den ikke er ferdig.
  const liveNow =
    match.status === 'IN_PLAY' ||
    match.status === 'PAUSED' ||
    (Date.parse(match.utcDate) <= Date.now() && match.status !== 'FINISHED');
  const finished = match.status === 'FINISHED';
  const hasScore = match.homeGoals != null && match.awayGoals != null;
  const showScore = finished || (liveNow && hasScore);
  const home = normalizeTeamName(match.homeTeam);
  const away = normalizeTeamName(match.awayTeam);
  const extra = extraTimeResult(match); // ekstraomganger/straffer (kun ferdige sluttspillskamper)

  // Kampklokke fra API-et (oppdateres ved polling). PAUSE = «Pause», ellers minutt (+ tilleggstid).
  const liveLabel =
    match.status === 'PAUSED'
      ? 'Pause'
      : match.minute != null
        ? `${match.minute}${match.injuryTime ? `+${match.injuryTime}` : ''}'`
        : 'LIVE';

  return (
    <div>
      <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full px-4 pt-1.5 pb-1.5 text-left active:bg-slate-700/30"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            {/* Hjemmelag: logo med navn under */}
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <TeamLogo name={home} className="mt-1.5 h-9 w-9" />
              <span className="w-full truncate text-center font-semibold leading-tight text-slate-100">{home}</span>
            </div>

            {/* Stilling / klokkeslett */}
            <div className="shrink-0 px-2 text-center">
              {showScore ? (
                <div className="text-xl font-bold tabular-nums text-slate-100">
                  {match.homeGoals}
                  <span className="px-1 text-slate-500">–</span>
                  {match.awayGoals}
                </div>
              ) : (
                <div className="text-sm font-medium text-slate-300">
                  {formatKickoff(match.utcDate)}
                </div>
              )}
              {showScore && extra && (
                <div className="text-[10px] tabular-nums text-amber-300/80">{extra}</div>
              )}
              {liveNow ? (
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-red-400">
                  <span className="animate-pulse">●</span>
                  <span className="tabular-nums">{liveLabel}</span>
                  <BroadcasterBadge apiId={match.apiId} className="h-3.5" />
                </div>
              ) : finished ? (
                <div className="text-[10px] text-slate-500">Ferdig</div>
              ) : (
                <div className="mt-1 flex justify-center">
                  <BroadcasterBadge apiId={match.apiId} className="h-4" />
                </div>
              )}
            </div>

            {/* Bortelag: logo med navn under */}
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <TeamLogo name={away} className="mt-1.5 h-9 w-9" />
              <span className="w-full truncate text-center font-semibold leading-tight text-slate-100">{away}</span>
            </div>
          </div>

          <div className="-mt-2 text-center text-[11px] text-slate-500">
            {open ? 'Skjul ▲' : 'Vis mer ▼'}
          </div>
        </button>

        {open && (
          <div className="border-t border-slate-700/70 px-3 pb-3 pt-2">
            <MatchEvents match={match} />
            <TipChips match={match} participants={participants} />
          </div>
        )}
    </div>
  );
}
