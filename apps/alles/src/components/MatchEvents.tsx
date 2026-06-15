import { Fragment } from 'react';
import type { MatchResult } from '../types';
import { normalizeTeamName } from '../utils/teamNames';
import { useMatchEvents } from '../hooks/useMatchEvents';

/** Korter ned «Julián Quiñones» → «Quiñones» for kompakt visning. */
function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : full;
}

type Side = 'home' | 'away';
// Mål grupperes per spiller (flere minutter + én ⚽ per mål); røde kort står alltid alene.
type EventRow = { side: Side; minutes: (number | null)[]; kind: 'goal' | 'own' | 'red'; name: string };

function iconsFor(r: EventRow): string {
  return r.kind === 'red' ? '🟥' : '⚽'.repeat(r.minutes.length);
}

/** Én lag-celle: navn + ikon, pakket inn mot midten (minutt-kolonnen). */
function SideCell({ row, side }: { row: EventRow; side: Side }) {
  if (row.side !== side) return <div />;
  const name = (
    <span className={`truncate ${row.kind === 'goal' ? 'text-slate-200' : 'text-red-300'}`}>
      {row.name}
      {row.kind === 'own' && ' (selvm.)'}
    </span>
  );
  const icon = (
    <span aria-hidden="true" className="shrink-0 text-[10px] leading-none">
      {iconsFor(row)}
    </span>
  );
  return (
    <div className={`flex min-w-0 items-baseline gap-1 ${side === 'home' ? 'justify-end' : 'justify-start'}`}>
      {side === 'home' ? (
        <>
          {name}
          {icon}
        </>
      ) : (
        <>
          {icon}
          {name}
        </>
      )}
    </div>
  );
}

interface Props {
  match: MatchResult;
}

/**
 * Tidslinje for én kamp (deep data): minuttet i midten, ikon (⚽/🟥) på siden til laget
 * som fikk det, spillernavn under lagnavnet. Henter kun for live/ferdige kamper og rendres
 * tomt (null) ellers. Tenkt brukt inni en åpnet kamp-visning (skjult bak et trykk).
 */
export default function MatchEvents({ match }: Props) {
  const liveNow =
    match.status === 'IN_PLAY' ||
    match.status === 'PAUSED' ||
    (Date.parse(match.utcDate) <= Date.now() && match.status !== 'FINISHED');
  const finished = match.status === 'FINISHED';

  const events = useMatchEvents(match.apiId, liveNow || finished);
  const redCards = events?.bookings.filter((b) => b.card === 'RED' || b.card === 'YELLOW_RED') ?? [];
  const goals = events?.goals ?? [];
  if (goals.length === 0 && redCards.length === 0) return null;

  const home = normalizeTeamName(match.homeTeam);
  const away = normalizeTeamName(match.awayTeam);
  const sideOf = (team: string): Side | null =>
    team === home ? 'home' : team === away ? 'away' : null;

  // Mål gruppert per spiller. API-et setter `goal.team` = scorerens lag; for SELVMÅL teller
  // målet for motstanderen, så det havner på motstanderens side (kolonnen summerer til stillingen).
  const groups = new Map<string, EventRow>();
  for (const g of goals) {
    const kind: EventRow['kind'] = g.type === 'OWN' ? 'own' : 'goal';
    const benefitTeam =
      g.type === 'OWN' ? (g.team === home ? away : g.team === away ? home : g.team) : g.team;
    const side = sideOf(benefitTeam);
    if (!side) continue;
    const name = lastName(g.scorer);
    const key = `${side}:${kind}:${name}`;
    const existing = groups.get(key);
    if (existing) existing.minutes.push(g.minute);
    else groups.set(key, { side, kind, name, minutes: [g.minute] });
  }
  for (const e of groups.values()) e.minutes.sort((a, b) => (a ?? 999) - (b ?? 999));

  // Røde kort: alltid egen rad (ikke gruppert), på spillerens lag-side.
  const reds: EventRow[] = redCards.flatMap((b) => {
    const side = sideOf(b.team);
    return side ? [{ side, kind: 'red' as const, name: lastName(b.player), minutes: [b.minute] }] : [];
  });

  const firstMin = (e: EventRow) => e.minutes[0] ?? 999;
  const rows = [...groups.values(), ...reds].sort((a, b) => firstMin(a) - firstMin(b));

  return (
    <div className="mb-3 border-b border-slate-700/50 pb-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-2 text-xs">
        {/* Lagnavn-overskrifter */}
        <div className="truncate pb-1 text-right text-[11px] font-semibold text-slate-400">{home}</div>
        <div />
        <div className="truncate pb-1 text-left text-[11px] font-semibold text-slate-400">{away}</div>

        {/* Én rad per hendelse, kronologisk; minutt i midten */}
        {rows.map((r, i) => (
          <Fragment key={i}>
            <SideCell row={r} side="home" />
            <div className="whitespace-nowrap px-1 text-center text-[11px] tabular-nums text-slate-500">
              {r.minutes
                .filter((m) => m != null)
                .map((m) => `${m}'`)
                .join(', ')}
            </div>
            <SideCell row={r} side="away" />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
