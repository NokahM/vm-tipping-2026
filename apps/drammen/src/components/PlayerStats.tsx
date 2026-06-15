import type { ReactNode } from 'react';
import type { StatsData, StatPlayer } from '../hooks/useStats';
import { normalizeTeamName } from '../utils/teamNames';
import TeamLogo from './TeamLogo';

const POS_NO: Record<string, string> = {
  Goalkeeper: 'Keeper',
  Defence: 'Forsvar',
  Midfield: 'Midt',
  Offence: 'Angrep',
};

function Section({
  title,
  players,
  value,
}: {
  title: string;
  players: StatPlayer[];
  value: (p: StatPlayer) => ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-slate-800">
      <div className="border-b border-slate-700/70 px-3 py-1.5 text-sm font-semibold text-slate-200">
        {title}
      </div>
      {players.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-500">Ingen data ennå.</p>
      ) : (
        <ul className="divide-y divide-slate-700/40">
          {players.map((p, i) => {
            const country = normalizeTeamName(p.team);
            return (
              <li key={p.id} className="flex items-center gap-2 px-2 py-1 text-xs">
                <span className="w-4 shrink-0 text-center text-slate-500">{i + 1}</span>
                <TeamLogo name={country} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-slate-100">{p.name}</span>
                {p.position && (
                  <span className="shrink-0 text-[10px] text-slate-500">
                    {POS_NO[p.position] ?? p.position}
                  </span>
                )}
                <span className="shrink-0 whitespace-nowrap pl-1 text-right font-semibold tabular-nums text-slate-100">
                  {value(p)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Spillerstats: toppscorer, assistkonge og råtass (kort), fra aggregert deep data. */
export default function PlayerStats({ data }: { data: StatsData | null }) {
  if (!data) {
    return <p className="px-1 text-center text-sm text-slate-500">Laster spillerstats…</p>;
  }
  const warming = data.coverage && data.coverage.cached < data.coverage.relevant;

  return (
    <div className="space-y-3">
      {warming && (
        <p className="px-1 text-center text-[10px] text-slate-500">
          Oppdaterer… ({data.coverage!.cached}/{data.coverage!.relevant} kamper lest)
        </p>
      )}
      <Section title="Toppscorer" players={data.topScorers} value={(p) => p.goals ?? 0} />
      <Section title="Assistkonge" players={data.topAssists} value={(p) => p.assists ?? 0} />
      <Section
        title="Råtass"
        players={data.topCards}
        value={(p) => (
          <>
            {p.yellow ? `${p.yellow}🟨` : ''}
            {p.yellow && p.red ? ' ' : ''}
            {p.red ? `${p.red}🟥` : ''}
            {!p.yellow && !p.red ? '0' : ''}
          </>
        )}
      />
    </div>
  );
}
