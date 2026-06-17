import { useMemo } from 'react';
import type { MatchResult } from '../types';
import { computeGroupTables, type GroupRow } from '../utils/groupTables';
import { normalizeTeamName } from '../utils/teamNames';
import { wcFrameStyle } from '../utils/wcFrame';
import TeamLogo from './TeamLogo';

/**
 * Gruppetabeller – to grupper per rad (kompakt: logo + navn + målforskjell + poeng).
 * Teller kun ferdigspilte kamper.
 */
export default function GroupTables({ results }: { results: MatchResult[] }) {
  const tables = useMemo(() => computeGroupTables(results), [results]);
  // Egen tilfeldig fase per gruppekort, så de ikke veksler farge i lås.
  const frameStyles = useMemo(() => tables.map(() => wcFrameStyle()), [tables.length]);

  if (tables.length === 0) {
    return <p className="px-1 text-center text-sm text-slate-500">Ingen gruppespill-kamper ennå.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {tables.map((t, i) => (
        <div
          key={t.group}
          style={frameStyles[i]}
          className="wc-frame overflow-hidden rounded-xl bg-slate-800"
        >
          <div className="flex items-center gap-1 border-b border-slate-700/70 px-2 py-1">
            <span className="flex-1 text-xs font-semibold text-slate-200">Gruppe {t.letter}</span>
            <span className="w-4 text-right text-[10px] font-medium text-slate-500">K</span>
            <span className="w-6 text-right text-[10px] font-medium text-slate-500">±</span>
            <span className="w-4 text-right text-[10px] font-medium text-slate-500">P</span>
          </div>
          <div className="divide-y divide-slate-700/40">
            {t.rows.map((r) => (
              <GroupRowLine key={r.team} row={r} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupRowLine({ row }: { row: GroupRow }) {
  const name = normalizeTeamName(row.team);
  return (
    <div className="flex items-center gap-1 px-2 py-1 text-xs">
      <TeamLogo name={name} className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-slate-100">{name}</span>
      <span className="w-4 shrink-0 text-right tabular-nums text-slate-500">{row.played}</span>
      <span className="w-6 shrink-0 text-right tabular-nums text-slate-500">
        {row.gd > 0 ? `+${row.gd}` : row.gd}
      </span>
      <span className="w-4 shrink-0 text-right font-semibold tabular-nums text-slate-100">
        {row.points}
      </span>
    </div>
  );
}
