import type { TeamCard } from '../hooks/useStats';
import { normalizeTeamName } from '../utils/teamNames';
import TeamLogo from './TeamLogo';

/** Kort per lag (gule + røde), sortert på flest røde. Del av Lagstats. */
export default function TeamCards({ teamCards }: { teamCards: TeamCard[] }) {
  if (!teamCards || teamCards.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl bg-slate-800">
      <div className="border-b border-slate-700/70 px-3 py-1.5 text-sm font-semibold text-slate-200">
        Kort per lag
      </div>
      <ul className="divide-y divide-slate-700/40">
        {teamCards.map((t) => {
          const name = normalizeTeamName(t.team);
          return (
            <li key={t.team} className="flex items-center gap-2 px-2 py-1 text-xs">
              <TeamLogo name={name} className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-slate-100">{name}</span>
              <span className="shrink-0 whitespace-nowrap text-right tabular-nums text-slate-300">
                {t.yellow}🟨 {t.red}🟥
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
