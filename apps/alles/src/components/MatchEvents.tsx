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
// Tidspunkt med overtid: 90+3 lagres som minute:90 + injuryTime:3. Ekstraomganger (101', 114' …)
// avsløres av selve minuttet, så vi trenger ingen egen fase-markering i tidslinjen.
type Stamp = { minute: number | null; injuryTime: number | null };
// Mål grupperes per spiller (flere minutter + én ⚽ per mål); røde kort/straffer står alltid alene.
// 'penmiss' = bommet straffe i åpent spill (API-et har ingen minutt for den → vises uten klokkeslett).
type Kind = 'goal' | 'pen' | 'own' | 'red' | 'penmiss';
type EventRow = { side: Side; minutes: Stamp[]; kind: Kind; name: string };

/** «67'», «90+3'» (overtid) eller null hvis minutt mangler. */
function fmtStamp(s: Stamp): string | null {
  if (s.minute == null) return null;
  return `${s.minute}${s.injuryTime ? `+${s.injuryTime}` : ''}'`;
}

function iconsFor(r: EventRow): string {
  return r.kind === 'red' ? '🟥' : r.kind === 'penmiss' ? '✗' : '⚽'.repeat(r.minutes.length);
}

function nameSuffix(kind: Kind): string {
  return kind === 'own' ? ' (selvm.)' : kind === 'pen' ? ' (str.)' : kind === 'penmiss' ? ' (str. bom)' : '';
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

function Mark({ scored }: { scored: boolean }) {
  return (
    <span aria-hidden="true" className={`shrink-0 text-[11px] leading-none ${scored ? 'text-emerald-400' : 'text-red-400'}`}>
      {scored ? '✓' : '✗'}
    </span>
  );
}

/**
 * Renser konk-sparkene fra `penalties`-arrayen:
 *  1) fjerner straffer tatt i ÅPENT SPILL (de scorede ligger i `goals` som PENALTY og vises i
 *     tidslinjen) – matchet på skytternavn, én per PENALTY-mål, siden de ligger først i arrayen.
 *  2) slår sammen påfølgende identiske spark (samme skytter+lag) – kildefeeden kan liste samme
 *     skytter to ganger på rad, noe som er umulig i en ekte straffekonk.
 * Den offisielle stillingen (score.penalties) brukes uansett til overskrift/«str. x–y».
 */
function cleanShootout(penalties: MatchPenalty[], inPlayPenScorers: string[]): MatchPenalty[] {
  const remove = new Map<string, number>();
  for (const n of inPlayPenScorers) remove.set(n, (remove.get(n) ?? 0) + 1);
  const filtered: MatchPenalty[] = [];
  for (const p of penalties) {
    const n = remove.get(p.player) ?? 0;
    if (p.scored && n > 0) {
      remove.set(p.player, n - 1); // dette er straffen fra åpent spill – hopp over i konken
      continue;
    }
    filtered.push(p);
  }
  const out: MatchPenalty[] = [];
  for (const p of filtered) {
    const prev = out[out.length - 1];
    if (prev && prev.player === p.player && prev.team === p.team) continue; // dropp påfølgende dublett
    out.push(p);
  }
  return out;
}

/** Straffesparkkonkurranse i to kolonner: hjemmelaget venstre, bortelaget høyre, ✓ scoret / ✗ bom. */
function Shootout({ pens, home, away }: { pens: MatchPenalty[]; home: string; away: string }) {
  const homeKicks = pens.filter((p) => p.team === home);
  const awayKicks = pens.filter((p) => p.team === away);
  return (
    <div className="col-span-3 mt-2.5 grid grid-cols-2 gap-x-4 text-xs">
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
  const penalties = events?.penalties ?? [];

  const home = normalizeTeamName(match.homeTeam);
  const away = normalizeTeamName(match.awayTeam);
  const sideOf = (team: string): Side | null =>
    team === home ? 'home' : team === away ? 'away' : null;

  // Straffekonk-kampene har hele konken i `penalties`. For andre kamper er `penalties` straffer i
  // åpent spill (scorede ligger også i `goals` → tas derfra; her trenger vi kun bommene).
  const isShootout = match.duration === 'PENALTY_SHOOTOUT';
  const inPlayMisses = isShootout ? [] : penalties.filter((p) => !p.scored);
  // Konk-sparkene, renset for straffer i åpent spill + kilde-dubletter.
  const inPlayPenScorers = goals.filter((g) => g.type === 'PENALTY').map((g) => g.scorer);
  const shootoutKicks = isShootout ? cleanShootout(penalties, inPlayPenScorers) : [];
  // Vis per-spark-lista KUN når den stemmer med den offisielle stillingen (score.penalties).
  // Den simulerte feeden kan ha feil `scored`-flagg (skytter vist som bom selv om hen scoret) →
  // da dropper vi den misvisende ✓/✗-visningen og lar «str. x–y» (på kampraden) stå som fasit.
  const homeScored = shootoutKicks.filter((p) => p.team === home && p.scored).length;
  const awayScored = shootoutKicks.filter((p) => p.team === away && p.scored).length;
  const showShootout =
    shootoutKicks.length > 0 &&
    match.penHomeGoals != null &&
    match.penAwayGoals != null &&
    homeScored === match.penHomeGoals &&
    awayScored === match.penAwayGoals;
  if (goals.length === 0 && redCards.length === 0 && penalties.length === 0) return null;

  // Mål gruppert per spiller. API-et setter `goal.team` = scorerens lag; for SELVMÅL teller målet
  // for motstanderen, så det havner på motstanderens side (kolonnen summerer til stillingen).
  // Straffemål (type PENALTY) får egen rad merket «(str.)». Ekstraomgangsmål skiller seg ut via
  // selve minuttet (101', 114' …), så vi trenger ingen fase-inndeling.
  const groups = new Map<string, EventRow>();
  for (const g of goals) {
    const kind: Kind = g.type === 'OWN' ? 'own' : g.type === 'PENALTY' ? 'pen' : 'goal';
    const benefitTeam =
      g.type === 'OWN' ? (g.team === home ? away : g.team === away ? home : g.team) : g.team;
    const side = sideOf(benefitTeam);
    if (!side) continue;
    const name = g.scorer;
    const key = `${side}:${kind}:${name}`;
    const stamp: Stamp = { minute: g.minute, injuryTime: g.injuryTime };
    const existing = groups.get(key);
    if (existing) existing.minutes.push(stamp);
    else groups.set(key, { side, kind, name, minutes: [stamp] });
  }
  for (const e of groups.values()) e.minutes.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));

  // Røde kort: alltid egen rad (ikke gruppert), på spillerens lag-side.
  const reds: EventRow[] = redCards.flatMap((b) => {
    const side = sideOf(b.team);
    return side
      ? [{ side, kind: 'red' as const, name: b.player, minutes: [{ minute: b.minute, injuryTime: b.injuryTime }] }]
      : [];
  });

  // Bommede straffer i åpent spill: egen rad uten minutt (API-et har ingen) → havner sist (firstMin
  // = 999), rett før en ev. straffekonk. Plasseres på lagets side.
  const penMisses: EventRow[] = inPlayMisses.flatMap((p) => {
    const side = sideOf(p.team);
    return side
      ? [{ side, kind: 'penmiss' as const, name: p.player, minutes: [{ minute: null, injuryTime: null }] }]
      : [];
  });

  const firstMin = (e: EventRow) => e.minutes[0]?.minute ?? 999;
  // Én sammenhengende tidslinje, sortert på minutt (ekstraomganger følger naturlig etter 90').
  const rows = [...groups.values(), ...reds, ...penMisses].sort((a, b) => firstMin(a) - firstMin(b));

  return (
    <div className="mb-3 border-b border-slate-700/50 pb-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-2 text-xs">
        {/* Hjemme venstre, borte høyre, minutt i midten – kronologisk, uten fase-skiller. */}
        {rows.map((r, i) => (
          <Fragment key={i}>
            <SideCell row={r} side="home" />
            <div className="whitespace-nowrap px-1 text-center text-[11px] tabular-nums text-slate-500">
              {r.minutes
                .map(fmtStamp)
                .filter((s): s is string => s != null)
                .join(', ')}
            </div>
            <SideCell row={r} side="away" />
          </Fragment>
        ))}
        {/* Straffekonk: egen 2-kolonners blokk (selvforklarende ✓/✗ – ingen skillestripe trengs). */}
        {showShootout && <Shootout pens={shootoutKicks} home={home} away={away} />}
      </div>
    </div>
  );
}
