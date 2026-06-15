import { useEffect, useState } from 'react';
import { fetchMatchEvents, type MatchEvents } from '../utils/apiClient';

// Modul-cache: holder sist hentede hendelser per kamp på tvers av mount/unmount, så
// gjenåpning av samme kort viser data umiddelbart (ingen tom flash) mens en frisk
// henting går i bakgrunnen.
const cache = new Map<number, MatchEvents>();

/**
 * Henter mål + kort (deep data) for én kamp, og poller mens den er aktiv.
 * `enabled` styrer om vi henter i det hele tatt (typisk kun for live-kamper),
 * så vi ikke bruker API-kall på kamper uten relevans.
 */
export function useMatchEvents(id: number | null, enabled: boolean): MatchEvents | null {
  const [events, setEvents] = useState<MatchEvents | null>(() =>
    id != null ? (cache.get(id) ?? null) : null,
  );

  useEffect(() => {
    if (!enabled || id == null) return;
    // Vis cachet verdi umiddelbart hvis vi har en (f.eks. ved id-bytte).
    const cached = cache.get(id);
    if (cached) setEvents(cached);

    let cancelled = false;
    const load = async () => {
      const e = await fetchMatchEvents(id);
      if (!cancelled && e) {
        cache.set(id, e);
        setEvents(e);
      }
    };
    void load();
    const t = setInterval(load, 20000); // ferske hendelser uten å hamre API-et (edge-cache 15s)
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id, enabled]);

  return events;
}
