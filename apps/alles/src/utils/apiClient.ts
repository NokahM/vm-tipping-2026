import type { MatchResult, Stage } from '../types';

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
