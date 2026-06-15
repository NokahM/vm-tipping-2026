import type { MatchResult } from '../types';
import { normalizeTeamName } from '../utils/teamNames';
import { useMatchEvents } from '../hooks/useMatchEvents';

/** Korter ned «Julián Quiñones» → «Quiñones» for kompakt visning. */
function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : full;
}

// Mål grupperes per spiller (flere minutter på én linje); røde kort står alltid alene.
type MatchEvent = { minutes: (number | null)[]; kind: 'goal' | 'own' | 'red'; name: string };

/** Én lag-kolonne: mål + røde kort kronologisk. align styrer venstre/høyre-speiling. */
function EventColumn({ events, align }: { events: MatchEvent[]; align: 'left' | 'right' }) {
  return (
    <ul className={`space-y-0.5 ${align === 'right' ? 'text-right' : ''}`}>
      {events.length === 0 && <li className="text-[11px] text-slate-600">–</li>}
      {events.map((ev, i) => (
        <li
          key={i}
          className={`flex items-baseline gap-1.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          <span aria-hidden="true" className="text-[10px] leading-none">
            {ev.kind === 'red' ? '🟥' : '⚽'.repeat(ev.minutes.length)}
          </span>
          <span className="shrink-0 tabular-nums text-[11px] text-slate-500">
            {ev.minutes
              .filter((m) => m != null)
              .map((m) => `${m}'`)
              .join(', ')}
          </span>
          <span className={`truncate ${ev.kind === 'goal' ? 'text-slate-200' : 'text-red-300'}`}>
            {ev.name}
            {ev.kind === 'own' && ' (selvm.)'}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  match: MatchResult;
}

/**
 * To-kolonne visning av mål + røde kort for én kamp (deep data). Henter kun for
 * live/ferdige kamper, og rendres tomt (null) ellers eller før data finnes. Tenkt
 * brukt inni en åpnet kamp-visning (skjult bak et trykk) – derfor greit på alle kamper.
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

  // API-et setter `goal.team` = scorerens lag. For vanlige mål er det laget målet teller
  // for; for SELVMÅL er det motstanderen som får målet → selvmål vises i motstanderens
  // kolonne (så kolonnen summerer til lagets stilling). Røde kort i spillerens lag-kolonne.
  const buildEvents = (team: string, opponent: string): MatchEvent[] => {
    // Mål gruppert per spiller (+ type) → flere minutter slås sammen til én linje.
    const groups = new Map<string, MatchEvent>();
    for (const g of goals.filter((x) => (x.type === 'OWN' ? x.team === opponent : x.team === team))) {
      const kind: MatchEvent['kind'] = g.type === 'OWN' ? 'own' : 'goal';
      const name = lastName(g.scorer);
      const key = `${kind}:${name}`;
      const existing = groups.get(key);
      if (existing) existing.minutes.push(g.minute);
      else groups.set(key, { minutes: [g.minute], kind, name });
    }
    for (const e of groups.values()) e.minutes.sort((a, b) => (a ?? 999) - (b ?? 999));
    // Røde kort: alltid egen linje (ikke gruppert).
    const reds = redCards
      .filter((b) => b.team === team)
      .map<MatchEvent>((b) => ({ minutes: [b.minute], kind: 'red', name: lastName(b.player) }));
    const firstMin = (e: MatchEvent) => e.minutes[0] ?? 999;
    return [...groups.values(), ...reds].sort((a, b) => firstMin(a) - firstMin(b));
  };

  return (
    <div className="mb-3 grid grid-cols-2 gap-3 border-b border-slate-700/50 pb-3">
      <EventColumn events={buildEvents(home, away)} align="left" />
      <EventColumn events={buildEvents(away, home)} align="right" />
    </div>
  );
}
