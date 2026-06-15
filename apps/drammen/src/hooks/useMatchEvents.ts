import { useEffect, useState } from 'react';
import { fetchMatchEvents, type MatchEvents } from '../utils/apiClient';

// Cache-entry: hendelsene + om de er fra kampens FERDIG-tilstand (da endrer de seg aldri mer).
interface Entry {
  events: MatchEvents;
  final: boolean;
}

// Modul-cache (rask, per fane-økt) + localStorage (overlever sideoppdatering). Ferdige kamper
// hentes dermed kun ÉN gang – deretter serveres de fra lager, ikke nytt API-kall ved hvert klikk.
const memCache = new Map<number, Entry>();
const LS_PREFIX = 'wc_match_events_';

function loadLS(id: number): Entry | null {
  try {
    const v = localStorage.getItem(LS_PREFIX + id);
    return v ? (JSON.parse(v) as Entry) : null;
  } catch {
    return null;
  }
}
function saveLS(id: number, entry: Entry): void {
  try {
    localStorage.setItem(LS_PREFIX + id, JSON.stringify(entry));
  } catch {
    /* localStorage full / utilgjengelig – ignorer (mem-cache holder for økta) */
  }
}

/** Tømmer både modul-cachen og localStorage-lageret (brukt av admin «Tøm cache»). */
export function clearMatchEventsCache(): void {
  memCache.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* ignorer */
  }
}

/**
 * Henter mål + kort (deep data) for én kamp. `enabled` styrer om vi henter i det hele tatt
 * (typisk kun for live/ferdige kamper). `live` styrer cache-strategien:
 *  - **live**: poll hvert 20s (stillingen kan endre seg).
 *  - **ferdig**: hent kun én gang hvis vi ikke alt har en lagret FERDIG-tilstand; ellers vis fra
 *    lager uten nytt kall. Lageret ligger i localStorage, så det overlever sideoppdatering.
 */
export function useMatchEvents(id: number | null, enabled: boolean, live: boolean): MatchEvents | null {
  const [events, setEvents] = useState<MatchEvents | null>(() => {
    if (id == null) return null;
    return (memCache.get(id) ?? loadLS(id))?.events ?? null;
  });

  useEffect(() => {
    if (!enabled || id == null) return;

    const cached = memCache.get(id) ?? loadLS(id);
    if (cached) {
      memCache.set(id, cached);
      setEvents(cached.events);
    }
    // Ferdig kamp som alt er lagret i ferdig-tilstand → ingen nytt kall.
    if (!live && cached?.final) return;

    let cancelled = false;
    const load = async () => {
      const e = await fetchMatchEvents(id);
      if (!cancelled && e) {
        const entry: Entry = { events: e, final: !live }; // ikke live nå = dette er ferdig-tilstanden
        memCache.set(id, entry);
        saveLS(id, entry);
        setEvents(e);
      }
    };
    void load();

    if (live) {
      const t = setInterval(load, 20000); // ferske hendelser uten å hamre API-et (edge-cache 15s)
      return () => {
        cancelled = true;
        clearInterval(t);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [id, enabled, live]);

  return events;
}
