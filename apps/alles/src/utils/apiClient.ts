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
  homeTeam: { id: number | null; name: string | null; tla: string | null };
  awayTeam: { id: number | null; name: string | null; tla: string | null };
  score: {
    winner: string | null;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
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
  type: GoalType;
  team: string; // normalisert (norsk) – laget målet teller FOR
  scorer: string;
}

export interface MatchBooking {
  minute: number | null;
  team: string; // normalisert (norsk)
  player: string;
  card: CardType;
}

export interface MatchEvents {
  goals: MatchGoal[];
  bookings: MatchBooking[];
}

interface RawDetail {
  goals?: Array<{
    minute: number | null;
    type: string;
    team: { name: string | null } | null;
    scorer: { name: string | null } | null;
  }>;
  bookings?: Array<{
    minute: number | null;
    team: { name: string | null } | null;
    player: { name: string | null } | null;
    card: string;
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
        type: (g.type as GoalType) ?? 'REGULAR',
        team: normalizeTeamName(g.team?.name ?? ''),
        scorer: g.scorer?.name ?? '',
      })),
      bookings: (m.bookings ?? []).map((b) => ({
        minute: b.minute,
        team: normalizeTeamName(b.team?.name ?? ''),
        player: b.player?.name ?? '',
        card: (b.card as CardType) ?? 'YELLOW',
      })),
    };
  } catch {
    return null;
  }
}

function mapMatch(m: RawMatch): MatchResult {
  return {
    apiId: m.id,
    stage: normalizeStage(m.stage),
    group: m.group ?? undefined,
    homeTeam: m.homeTeam.name ?? 'TBD',
    awayTeam: m.awayTeam.name ?? 'TBD',
    homeGoals: m.score.fullTime.home,
    awayGoals: m.score.fullTime.away,
    status: m.status as MatchResult['status'],
    utcDate: m.utcDate,
  };
}
