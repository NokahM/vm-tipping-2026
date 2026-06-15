import { useMemo } from 'react';
import type { MatchResult } from '../types';
import { computeGroupTables, type GroupRow } from '../utils/groupTables';
import { normalizeTeamName } from '../utils/teamNames';
import { wcFrameStyle } from '../utils/wcFrame';
import TeamLogo from './TeamLogo';

/**
 * Gruppetabeller – to grupper per rad (kompakt: logo + navn + målforskjell + poeng).
 * Teller kun ferdigspilte kamper. Dårligste lag så langt (færrest poeng → lavest
 * målforskjell → færrest mål, blant lag som har spilt) markeres med rød rad.
 */
export default function GroupTables({ results }: { results: MatchResult[] }) {
  const tables = useMemo(() => computeGroupTables(results), [results]);

  const frameStyle = useMemo(wcFrameStyle, []);

  const worstTeam = useMemo(() => {
    const played = tables.flatMap((t) => t.rows).filter((r) => r.played > 0);
    if (played.length === 0) return null;
    return [...played].sort((a, b) => a.points - b.points || a.gd - b.gd || a.gf - b.gf)[0].team;
  }, [tables]);

  if (tables.length === 0) {
    return <p className="px-1 text-center text-sm text-slate-500">Ingen gruppespill-kamper ennå.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {tables.map((t) => (
          <div key={t.group} style={frameStyle} className="wc-frame overflow-hidden rounded-xl bg-slate-800">
            <div className="border-b border-slate-700/70 px-2 py-1 text-xs font-semibold text-slate-200">
              Gruppe {t.letter}
            </div>
            <div className="divide-y divide-slate-700/40">
              {t.rows.map((r) => (
                <GroupRowLine key={r.team} row={r} worst={r.team === worstTeam} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {worstTeam && (
        <p className="px-1 text-center text-[10px] text-slate-500">
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500/50 align-middle" /> dårligste
          lag så langt
        </p>
      )}
    </div>
  );
}

function GroupRowLine({ row, worst }: { row: GroupRow; worst: boolean }) {
  const name = normalizeTeamName(row.team);
  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 text-xs ${worst ? 'bg-red-950/40' : ''}`}
      title={worst ? 'Dårligste lag så langt' : undefined}
    >
      <TeamLogo name={name} className="h-4 w-4 shrink-0" />
      <span className={`min-w-0 flex-1 truncate ${worst ? 'text-red-300' : 'text-slate-100'}`}>
        {name}
      </span>
      <span className="w-6 shrink-0 text-right tabular-nums text-slate-500">
        {row.gd > 0 ? `+${row.gd}` : row.gd}
      </span>
      <span className="w-4 shrink-0 text-right font-semibold tabular-nums text-slate-100">
        {row.points}
      </span>
    </div>
  );
}
