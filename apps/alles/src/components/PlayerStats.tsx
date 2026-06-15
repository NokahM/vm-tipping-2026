import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { StatsData, StatPlayer } from '../hooks/useStats';
import { normalizeTeamName } from '../utils/teamNames';
import { wcFrameStyle } from '../utils/wcFrame';
import TeamLogo from './TeamLogo';

/**
 * Normaliserer API-posisjonen til fire norske bøtter. API-et blander grove verdier
 * (Goalkeeper/Defence/Midfield/Offence) med spesifikke (f.eks. «Left Winger»), så vi
 * matcher på nøkkelord og faller tilbake til rå tekst for ukjente.
 */
function positionLabel(pos: string): string {
  const p = pos.toLowerCase();
  if (p.includes('keeper')) return 'Keeper';
  if (p.includes('back') || p.includes('defence') || p.includes('defender')) return 'Forsvar';
  if (p.includes('midfield')) return 'Midtbane';
  if (
    p.includes('wing') ||
    p.includes('forward') ||
    p.includes('offence') ||
    p.includes('striker') ||
    p.includes('attack')
  )
    return 'Angrep';
  return pos;
}

function Section({
  title,
  players,
  rankKey,
  value,
  frameStyle,
}: {
  title: string;
  players: StatPlayer[];
  rankKey: (p: StatPlayer) => string | number;
  value: (p: StatPlayer) => ReactNode;
  frameStyle: CSSProperties;
}) {
  // Delt plassering ved likhet (1, 2, 2, 4 …) – som tabellen.
  const ranks: number[] = [];
  players.forEach((p, i) => {
    ranks[i] = i > 0 && rankKey(p) === rankKey(players[i - 1]) ? ranks[i - 1] : i + 1;
  });

  return (
    <div style={frameStyle} className="wc-frame overflow-hidden rounded-xl bg-slate-800">
      <div className="border-b border-slate-700/70 px-3 py-1.5 text-sm font-semibold text-slate-200">
        {title}
      </div>
      {players.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-500">Ingen data ennå.</p>
      ) : (
        <ul className="divide-y divide-slate-700/40">
          {players.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 px-2 py-1 text-xs">
              <span className="w-5 shrink-0 text-center tabular-nums text-slate-500">{ranks[i]}</span>
              <TeamLogo name={normalizeTeamName(p.team)} className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-slate-100">{p.name}</span>
              {p.position && (
                <span className="shrink-0 text-[10px] text-slate-500">{positionLabel(p.position)}</span>
              )}
              <span className="shrink-0 whitespace-nowrap pl-1 text-right font-semibold tabular-nums text-slate-100">
                {value(p)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Spillerstats: toppscorer, assistkonge og råtass (kort), fra aggregert deep data. */
export default function PlayerStats({ data }: { data: StatsData | null }) {
  const frameStyle = useMemo(wcFrameStyle, []);
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
      <Section
        title="Toppscorer"
        players={data.topScorers}
        frameStyle={frameStyle}
        rankKey={(p) => p.goals ?? 0}
        value={(p) => p.goals ?? 0}
      />
      <Section
        title="Assistkonge"
        players={data.topAssists}
        frameStyle={frameStyle}
        rankKey={(p) => p.assists ?? 0}
        value={(p) => p.assists ?? 0}
      />
      <Section
        title="Råtass"
        players={data.topCards}
        frameStyle={frameStyle}
        rankKey={(p) => `${p.red ?? 0}|${p.yellow ?? 0}`}
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
