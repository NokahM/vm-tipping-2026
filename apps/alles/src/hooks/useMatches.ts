import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWCMatches } from '../utils/apiClient';
import { reconcileResults } from '../utils/reconcile';
import { STORAGE_KEYS } from '../config';
import type { MatchResult } from '../types';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutter
const POLL_INTERVAL = 60 * 1000; // auto-oppdater hvert minutt (edge-cachen skåner rategrensen)

interface CacheShape {
  data: MatchResult[];
  timestamp: number;
}

interface UseMatchesResult {
  results: MatchResult[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

/**
 * Henter alle VM-kamper og cacher dem i localStorage i 5 minutter.
 * Hvert nytt svar flettes med forrige (reconcileResults) slik at et allerede
 * ferdig resultat aldri kan «forsvinne» pga. en inkonsistent API-respons.
 */
export function useMatches(): UseMatchesResult {
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Speiler siste resultater synkront, så refresh() kan flette mot dem.
  const resultsRef = useRef<MatchResult[]>([]);

  const store = useCallback((data: MatchResult[], timestamp: number) => {
    resultsRef.current = data;
    setResults(data);
    setLastUpdated(new Date(timestamp));
    localStorage.setItem(STORAGE_KEYS.results, JSON.stringify({ data, timestamp } as CacheShape));
  }, []);

  // silent=true ved bakgrunns-polling: ingen «Laster …»-flimmer, men data og
  // feilstatus oppdateres som vanlig.
  const doFetch = useCallback(
    async (silent: boolean) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const fresh = await fetchWCMatches();
        store(reconcileResults(resultsRef.current, fresh), Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Kunne ikke hente resultater.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [store],
  );

  const refresh = useCallback(() => doFetch(false), [doFetch]);

  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEYS.results);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached) as CacheShape;
        resultsRef.current = data; // synkront, før evt. refresh
        setResults(data);
        setLastUpdated(new Date(timestamp));
        if (Date.now() - timestamp < CACHE_TTL) {
          setLoading(false);
          return; // fersk nok – ikke kall API-et
        }
      } catch {
        // korrupt cache – hent på nytt
      }
    }
    void doFetch(false);
  }, [doFetch]);

  // Auto-oppdatering: hent ferske resultater hvert minutt mens fanen er synlig,
  // og umiddelbart når brukeren kommer tilbake til fanen. Stille (ingen spinner).
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void doFetch(true);
    };
    const id = setInterval(tick, POLL_INTERVAL);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [doFetch]);

  return { results, loading, error, lastUpdated, refresh };
}
