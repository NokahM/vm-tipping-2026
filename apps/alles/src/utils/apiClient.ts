import type { MatchResult, Stage } from '../types';
import { normalizeTeamName } from './teamNames';

/**
 * Klienten kaller en proxy på samme origin (/api/matches) i stedet for
 * football-data.org direkte. Dette unngår CORS, og holder API-nøkkelen
 * server-side (Vite dev-proxy lokalt, Vercel-funksjon i produksjon).
 */
const ENDPOINT = '/api/matches';

export type ApiStatus = 'FINISHED' | 'SCHEDULED' | 'IN_PLAY' | 'TIMED' | 'PAUSED';

/** Rå kamp-struktur slik football-data.org returnerer den (delvis typet). */
interface RawMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group: string | null;
  minute?: number | null;
  injuryTime?: number | null;
  homeTeam: { id: number | null; name: string | null; tla: string | null };
  awayTeam: { id: number | null; name: string | null; tla: string | null };
  score: {
    winner: string | null;
    duration?: string; // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
    fullTime: { home: number | null; away: number | null }; // inkl. ekstraomganger + straffekonk
    halfTime: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null }; // satt KUN når kampen gikk utover 90 min
    penalties?: { home: number | null; away: number | null }; // satt KUN ved straffekonk
  };
}

interface MatchesResponse {
  matches?: RawMatch[];
  error?: string;
}

interface FetchOptions {
  status?: ApiStatus;
  stage?: Stage;
}

/** Henter kamper via proxyen. Kaster ved HTTP-feil eller feilmelding fra proxy. */
export async function fetchWCMatches(options: FetchOptions = {}): Promise<MatchResult[]> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.stage) params.set('stage', options.stage);
  const query = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(`${ENDPOINT}${query}`);
  const json = (await res.json().catch(() => ({}))) as MatchesResponse;

  if (!res.ok) {
    throw new Error(json.error ?? `API-feil: ${res.status} ${res.statusText}`);
  }
  return (json.matches ?? []).map(mapMatch);
}

// football-data.org bruker LAST_32/LAST_16 for sekstendels-/åttendelsfinaler;
// resten av koden bruker ROUND_OF_32/ROUND_OF_16. Oversett ved API-grensen.
const STAGE_ALIASES: Record<string, Stage> = {
  LAST_32: 'ROUND_OF_32',
  LAST_16: 'ROUND_OF_16',
};
function normalizeStage(s: string): Stage {
  return (STAGE_ALIASES[s] ?? s) as Stage;
}

// ── Deep data (enkeltkamp): mål + kort ────────────────────────────────────

export type GoalType = 'REGULAR' | 'OWN' | 'PENALTY';
export type CardType = 'YELLOW' | 'RED' | 'YELLOW_RED';

export interface MatchGoal {
  minute: number | null;
  injuryTime: number | null; // overtid: 90+N lagres som minute:90 + injuryTime:N
  type: GoalType;
  team: string; // normalisert (norsk) – laget målet teller FOR
  scorer: string;
}

export interface MatchBooking {
  minute: number | null;
  injuryTime: number | null;
  team: string; // normalisert (norsk)
  player: string;
  card: CardType;
}

export interface MatchPenalty {
  player: string;
  team: string; // normalisert (norsk)
  scored: boolean; // true = scoret, false = bom/reddet
}

export interface MatchEvents {
  goals: MatchGoal[];
  bookings: MatchBooking[];
  // ALLE straffespark i kampen (åpent spill OG straffekonk), i rekkefølge, UTEN minutt. Scorede
  // straffer i spill ligger også i `goals` (type PENALTY); bom finnes kun her (scored:false).
  penalties: MatchPenalty[];
}

interface RawDetail {
  goals?: Array<{
    minute: number | null;
    injuryTime?: number | null;
    type: string;
    team: { name: string | null } | null;
    scorer: { name: string | null } | null;
  }>;
  bookings?: Array<{
    minute: number | null;
    injuryTime?: number | null;
    team: { name: string | null } | null;
    player: { name: string | null } | null;
    card: string;
  }>;
  // Straffesparkkonkurranse (egen top-level array, IKKE i `goals`): ett objekt per spark i rekkefølge.
  penalties?: Array<{
    player?: { name: string | null } | null;
    team?: { name: string | null } | null;
    scored?: boolean;
  }>;
  error?: string;
}

/**
 * Henter mål + kort for én kamp via /api/matchdetail. Returnerer null ved feil
 * (live-kortet faller da pent tilbake til kun stilling).
 */
export async function fetchMatchEvents(id: number): Promise<MatchEvents | null> {
  try {
    const res = await fetch(`/api/matchdetail?id=${id}`);
    if (!res.ok) return null;
    const m = (await res.json()) as RawDetail;
    return {
      goals: (m.goals ?? []).map((g) => ({
        minute: g.minute,
        injuryTime: g.injuryTime ?? null,
        type: (g.type as GoalType) ?? 'REGULAR',
        team: normalizeTeamName(g.team?.name ?? ''),
        scorer: g.scorer?.name ?? '',
      })),
      bookings: (m.bookings ?? []).map((b) => ({
        minute: b.minute,
        injuryTime: b.injuryTime ?? null,
        team: normalizeTeamName(b.team?.name ?? ''),
        player: b.player?.name ?? '',
        card: (b.card as CardType) ?? 'YELLOW',
      })),
      penalties: (m.penalties ?? []).map((p) => ({
        player: p.player?.name ?? '',
        team: normalizeTeamName(p.team?.name ?? ''),
        scored: !!p.scored,
      })),
    };
  } catch {
    return null;
  }
}

function mapMatch(m: RawMatch): MatchResult {
  const ft = m.score.fullTime;
  const reg = m.score.regularTime; // satt kun når kampen gikk utover 90 min
  const pens = m.score.penalties; // satt kun ved straffekonk
  const went120 = reg != null;

  // Resultatet tips scores mot = stillingen etter 90 min. Når kampen gikk til ekstraomganger/
  // straffer ligger 90-min-resultatet i `regularTime`; ellers er `fullTime` allerede 90-min-stillingen.
  const homeGoals = went120 ? reg!.home : ft.home;
  const awayGoals = went120 ? reg!.away : ft.away;

  // Fullt spille-resultat (inkl. ekstraomganger, EKSKL. straffekonk) = fullTime − straffer.
  // Straffemål er en egen avgjørelse og skal ikke telle som «resultat» eller i målstatistikken.
  const sub = (a: number | null, b: number | null | undefined) => (a == null ? null : a - (b ?? 0));

  return {
    apiId: m.id,
    stage: normalizeStage(m.stage),
    group: m.group ?? undefined,
    homeTeam: m.homeTeam.name ?? 'TBD',
    awayTeam: m.awayTeam.name ?? 'TBD',
    homeGoals,
    awayGoals,
    aetHomeGoals: went120 ? sub(ft.home, pens?.home) : undefined,
    aetAwayGoals: went120 ? sub(ft.away, pens?.away) : undefined,
    penHomeGoals: pens?.home ?? undefined,
    penAwayGoals: pens?.away ?? undefined,
    duration: (m.score.duration as MatchResult['duration']) ?? undefined,
    winner: (m.score.winner as MatchResult['winner']) ?? null,
    status: m.status as MatchResult['status'],
    utcDate: m.utcDate,
    minute: m.minute ?? null,
    injuryTime: m.injuryTime ?? null,
  };
}
