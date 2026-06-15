import { useMemo } from 'react';
import type { MatchResult } from '../types';
import { computeGroupTables } from '../utils/groupTables';
import { normalizeTeamName } from '../utils/teamNames';
import TeamLogo from './TeamLogo';

/** Gruppetabeller (en kompakt tabell per gruppe). Teller kun ferdigspilte kamper. */
export default function GroupTables({ results }: { results: MatchResult[] }) {
  const tables = useMemo(() => computeGroupTables(results), [results]);

  if (tables.length === 0) {
    return (
      <p className="px-1 text-center text-sm text-slate-500">Ingen gruppespill-kamper ennå.</p>
    );
  }

  return (
    <div className="space-y-3">
      {tables.map((t) => (
        <div key={t.group} className="overflow-hidden rounded-xl bg-slate-800">
          <div className="border-b border-slate-700/70 px-3 py-1.5 text-sm font-semibold text-slate-200">
            Gruppe {t.letter}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-500">
                <th className="w-5 py-1 text-center font-medium">#</th>
                <th className="py-1 pl-1 text-left font-medium">Lag</th>
                <th className="w-7 py-1 text-center font-medium" title="Kamper">K</th>
                <th className="w-12 py-1 text-center font-medium" title="Mål">Mål</th>
                <th className="w-8 py-1 text-center font-medium" title="Målforskjell">±</th>
                <th className="w-7 py-1 text-center font-medium" title="Poeng">P</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => {
                const name = normalizeTeamName(r.team);
                return (
                  <tr key={r.team} className="border-t border-slate-700/40">
                    <td className="py-1 text-center text-slate-500">{i + 1}</td>
                    <td className="py-1 pl-1">
                      <div className="flex items-center gap-1.5">
                        <TeamLogo name={name} className="h-4 w-4 shrink-0" />
                        <span className="truncate text-slate-100">{name}</span>
                      </div>
                    </td>
                    <td className="py-1 text-center tabular-nums text-slate-400">{r.played}</td>
                    <td className="py-1 text-center tabular-nums text-slate-400">
                      {r.gf}–{r.ga}
                    </td>
                    <td className="py-1 text-center tabular-nums text-slate-400">
                      {r.gd > 0 ? `+${r.gd}` : r.gd}
                    </td>
                    <td className="py-1 text-center font-semibold tabular-nums text-slate-100">
                      {r.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
