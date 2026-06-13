import { useCallback, useEffect, useState } from 'react';
import { fetchWCMatches } from '../utils/apiClient';
import { STORAGE_KEYS } from '../config';
import type { MatchResult } from '../types';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutter

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
 * Scoring filtrerer selv ut ferdige kamper; her hentes alt (også kommende),
 * slik at kamplisten kan vise oppsettet.
 */
export function useMatches(): UseMatchesResult {
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWCMatches();
      const payload: CacheShape = { data, timestamp: Date.now() };
      localStorage.setItem(STORAGE_KEYS.results, JSON.stringify(payload));
      setResults(data);
      setLastUpdated(new Date(payload.timestamp));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke hente resultater.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEYS.results);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached) as CacheShape;
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
    void refresh();
  }, [refresh]);

  return { results, loading, error, lastUpdated, refresh };
}
