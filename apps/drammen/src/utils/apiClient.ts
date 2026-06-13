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

function mapMatch(m: RawMatch): MatchResult {
  return {
    apiId: m.id,
    stage: m.stage as Stage,
    group: m.group ?? undefined,
    homeTeam: m.homeTeam.name ?? 'TBD',
    awayTeam: m.awayTeam.name ?? 'TBD',
    homeGoals: m.score.fullTime.home,
    awayGoals: m.score.fullTime.away,
    status: m.status as MatchResult['status'],
    utcDate: m.utcDate,
  };
}
