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
 * Fremhevet «Aktuell kamp»-kort: live-kampen nå, ellers neste kommende.
 * Layout: <logo> lag  stilling  lag <logo>. Klikkbart for å vise alles tips.
 */
export default function FeaturedMatch({ match, participants }: Props) {
  const [open, setOpen] = useState(false);

  const live = match.status === 'IN_PLAY' || match.status === 'PAUSED';
  const played = match.status === 'FINISHED' || live;
  const home = normalizeTeamName(match.homeTeam);
  const away = normalizeTeamName(match.awayTeam);

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-white">
        Aktuell kamp
      </h2>
      <div className="overflow-hidden rounded-xl border border-slate-600 bg-slate-800 ring-1 ring-wc-red/30">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full px-4 py-3 text-left active:bg-slate-700/30"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            {/* Hjemmelag: logo + navn */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <TeamLogo name={home} className="h-9 w-9" />
              <span className="truncate font-semibold text-slate-100">{home}</span>
            </div>

            {/* Stilling / klokkeslett */}
            <div className="shrink-0 px-2 text-center">
              {played ? (
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
              {live ? (
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-red-400">
                  <span>● LIVE</span>
                  <BroadcasterBadge apiId={match.apiId} className="h-3.5" />
                </div>
              ) : match.status === 'FINISHED' ? (
                <div className="text-[10px] text-slate-500">Ferdig</div>
              ) : (
                <div className="mt-1 flex justify-center">
                  <BroadcasterBadge apiId={match.apiId} className="h-4" />
                </div>
              )}
            </div>

            {/* Bortelag: navn + logo */}
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <span className="truncate text-right font-semibold text-slate-100">{away}</span>
              <TeamLogo name={away} className="h-9 w-9" />
            </div>
          </div>

          <div className="mt-1.5 text-center text-[11px] text-slate-500">
            {open ? 'Skjul tips ▲' : 'Vis tips ▼'}
          </div>
        </button>

        {open && (
          <div className="border-t border-slate-700/70 px-3 pb-3 pt-2">
            <TipChips match={match} participants={participants} />
          </div>
        )}
      </div>
    </section>
  );
}
