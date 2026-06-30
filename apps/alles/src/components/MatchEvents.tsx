import { Fragment } from 'react';
import type { MatchResult } from '../types';
import type { MatchPenalty } from '../utils/apiClient';
import { normalizeTeamName } from '../utils/teamNames';
import { useMatchEvents } from '../hooks/useMatchEvents';

/**
 * Viser fullt spillernavn, men forkorter fornavn(ene) til initial når navnet blir for
 * langt for kolonnen («Vinicius Junior» → «V. Junior», «Luis Alberto Suárez» → «L. A. Suárez»).
 * Ett-ords navn røres ikke. `truncate` på elementet er siste sikring mot overflyt.
 */
const NAME_MAX = 16;
function displayName(full: string): string {
  const name = full.trim().replace(/\s+/g, ' ');
  if (name.length <= NAME_MAX) return name;
  const parts = name.split(' ');
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(' ');
  return `${initials} ${last}`;
}

type Side = 'home' | 'away';
type Phase = 'regular' | 'extra'; // ordinær tid (≤ 90') vs. ekstraomganger (> 90')
// Tidspunkt med overtid: 90+3 lagres som minute:90 + injuryTime:3.
type Stamp = { minute: number | null; injuryTime: number | null };
// Mål grupperes per spiller (flere minutter + én ⚽ per mål); røde kort/straffer står alltid alene.
type Kind = 'goal' | 'pen' | 'own' | 'red';
type EventRow = { side: Side; phase: Phase; minutes: Stamp[]; kind: Kind; name: string };

/** Mål etter 90. minutt = ekstraomganger. Ukjent minutt → ordinær tid. */
const phaseOf = (minute: number | null): Phase => (minute != null && minute > 90 ? 'extra' : 'regular');

/** «67'», «90+3'» (overtid) eller null hvis minutt mangler. */
function fmtStamp(s: Stamp): string | null {
  if (s.minute == null) return null;
  return `${s.minute}${s.injuryTime ? `+${s.injuryTime}` : ''}'`;
}

function iconsFor(r: EventRow): string {
  return r.kind === 'red' ? '🟥' : '⚽'.repeat(r.minutes.length);
}

function nameSuffix(kind: Kind): string {
  return kind === 'own' ? ' (selvm.)' : kind === 'pen' ? ' (str.)' : '';
}

/** Én lag-celle: navn + ikon, pakket inn mot midten (minutt-kolonnen). */
function SideCell({ row, side }: { row: EventRow; side: Side }) {
  if (row.side !== side) return <div />;
  const scoring = row.kind === 'goal' || row.kind === 'pen';
  const name = (
    <span className={`truncate ${scoring ? 'text-slate-200' : 'text-red-300'}`}>
      {displayName(row.name)}
      {nameSuffix(row.kind)}
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

/** Tynn skillelinje med en liten etikett (+ ev. stilling), spenner over hele bredden. */
function PhaseDivider({ label, score }: { label: string; score?: string }) {
  return (
    <div className="col-span-3 my-1 flex items-center gap-2">
      <span className="h-px flex-1 bg-slate-700/60" />
      <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
        {score ? <span className="ml-1 tabular-nums text-slate-400">{score}</span> : null}
      </span>
      <span className="h-px flex-1 bg-slate-700/60" />
    </div>
  );
}

function Mark({ scored }: { scored: boolean }) {
  return (
    <span aria-hidden="true" className={`shrink-0 text-[11px] leading-none ${scored ? 'text-emerald-400' : 'text-red-400'}`}>
      {scored ? '✓' : '✗'}
    </span>
  );
}

/** Straffesparkkonkurranse i to kolonner: hjemmelaget venstre, bortelaget høyre, ✓ scoret / ✗ bom. */
function Shootout({ pens, home, away }: { pens: MatchPenalty[]; home: string; away: string }) {
  const homeKicks = pens.filter((p) => p.team === home);
  const awayKicks = pens.filter((p) => p.team === away);
  return (
    <div className="col-span-3 mt-1 grid grid-cols-2 gap-x-4 text-xs">
      <ul className="space-y-0.5">
        {homeKicks.map((p, i) => (
          <li key={i} className="flex min-w-0 items-baseline justify-end gap-1">
            <span className={`truncate ${p.scored ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
              {displayName(p.player)}
            </span>
            <Mark scored={p.scored} />
          </li>
        ))}
      </ul>
      <ul className="space-y-0.5">
        {awayKicks.map((p, i) => (
          <li key={i} className="flex min-w-0 items-baseline justify-start gap-1">
            <Mark scored={p.scored} />
            <span className={`truncate ${p.scored ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
              {displayName(p.player)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  match: MatchResult;
}

/**
 * Tidslinje for én kamp (deep data): minuttet i midten, ikon (⚽/🟥) på siden til laget
 * som fikk det, spillernavnet på samme side (hjemme venstre, borte høyre – lagnavn står
 * allerede i kort-headeren over). Sluttspillskamper som gikk utover 90 min deles med tynne
 * skillelinjer (etter 90 min · etter ekstraomganger · straffer), og straffekonken vises i to
 * kolonner. Henter kun for live/ferdige kamper og rendres tomt (null) ellers.
 */
export default function MatchEvents({ match }: Props) {
  const liveNow =
    match.status === 'IN_PLAY' ||
    match.status === 'PAUSED' ||
    (Date.parse(match.utcDate) <= Date.now() && match.status !== 'FINISHED');
  const finished = match.status === 'FINISHED';

  const events = useMatchEvents(match.apiId, liveNow || finished, liveNow);
  const redCards = events?.bookings.filter((b) => b.card === 'RED' || b.card === 'YELLOW_RED') ?? [];
  const goals = events?.goals ?? [];
  const shootout = events?.shootout ?? [];
  if (goals.length === 0 && redCards.length === 0 && shootout.length === 0) return null;

  const home = normalizeTeamName(match.homeTeam);
  const away = normalizeTeamName(match.awayTeam);
  const sideOf = (team: string): Side | null =>
    team === home ? 'home' : team === away ? 'away' : null;

  // Mål gruppert per spiller (per fase + type). API-et setter `goal.team` = scorerens lag; for
  // SELVMÅL teller målet for motstanderen, så det havner på motstanderens side (kolonnen summerer
  // til stillingen). Straffemål (type PENALTY) får egen rad merket «(str.)».
  const groups = new Map<string, EventRow>();
  for (const g of goals) {
    const kind: Kind = g.type === 'OWN' ? 'own' : g.type === 'PENALTY' ? 'pen' : 'goal';
    const benefitTeam =
      g.type === 'OWN' ? (g.team === home ? away : g.team === away ? home : g.team) : g.team;
    const side = sideOf(benefitTeam);
    if (!side) continue;
    const phase = phaseOf(g.minute);
    const name = g.scorer;
    const key = `${side}:${kind}:${name}:${phase}`;
    const stamp: Stamp = { minute: g.minute, injuryTime: g.injuryTime };
    const existing = groups.get(key);
    if (existing) existing.minutes.push(stamp);
    else groups.set(key, { side, phase, kind, name, minutes: [stamp] });
  }
  for (const e of groups.values()) e.minutes.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));

  // Røde kort: alltid egen rad (ikke gruppert), på spillerens lag-side.
  const reds: EventRow[] = redCards.flatMap((b) => {
    const side = sideOf(b.team);
    return side
      ? [{ side, phase: phaseOf(b.minute), kind: 'red' as const, name: b.player, minutes: [{ minute: b.minute, injuryTime: b.injuryTime }] }]
      : [];
  });

  const firstMin = (e: EventRow) => e.minutes[0]?.minute ?? 999;
  const all = [...groups.values(), ...reds];
  const sortByMin = (rows: EventRow[]) => rows.sort((a, b) => firstMin(a) - firstMin(b));
  const regularRows = sortByMin(all.filter((r) => r.phase === 'regular'));
  const extraRows = sortByMin(all.filter((r) => r.phase === 'extra'));

  const wentToShootout = shootout.length > 0;
  // Kampen gikk utover 90 → vis fase-skiller. (duration finnes for ferdige/live e.o.-kamper.)
  const wentPast90 = match.duration === 'EXTRA_TIME' || match.duration === 'PENALTY_SHOOTOUT' || extraRows.length > 0 || wentToShootout;
  const score = (h: number | null | undefined, a: number | null | undefined) =>
    h == null || a == null ? undefined : `${h}–${a}`;

  const renderRows = (rows: EventRow[]) =>
    rows.map((r, i) => (
      <Fragment key={`${r.phase}-${i}`}>
        <SideCell row={r} side="home" />
        <div className="whitespace-nowrap px-1 text-center text-[11px] tabular-nums text-slate-500">
          {r.minutes
            .map(fmtStamp)
            .filter((s): s is string => s != null)
            .join(', ')}
        </div>
        <SideCell row={r} side="away" />
      </Fragment>
    ));

  return (
    <div className="mb-3 border-b border-slate-700/50 pb-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-2 text-xs">
        {/* Ordinær tid; hjemme venstre, borte høyre, minutt i midten. */}
        {renderRows(regularRows)}

        {/* Sluttspill utover 90 min: skillelinjer med stilling per fase. */}
        {wentPast90 && <PhaseDivider label="Etter 90 min" score={score(match.homeGoals, match.awayGoals)} />}
        {renderRows(extraRows)}
        {wentToShootout && extraRows.length > 0 && (
          <PhaseDivider label="Etter eks.oms." score={score(match.aetHomeGoals, match.aetAwayGoals)} />
        )}
        {wentToShootout && (
          <>
            <PhaseDivider label="Straffer" score={score(match.penHomeGoals, match.penAwayGoals)} />
            <Shootout pens={shootout} home={home} away={away} />
          </>
        )}
      </div>
    </div>
  );
}
