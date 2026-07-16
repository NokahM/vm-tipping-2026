import { useEffect, useState } from 'react';

export interface StatPlayer {
  id: number;
  name: string;
  team: string; // rått (engelsk) lagnavn fra API – normaliseres ved visning
  position: string; // rå API-posisjon: Goalkeeper | Defence | Midfield | Offence
  goals?: number;
  assists?: number;
  yellow?: number;
  red?: number;
}

export interface TeamCard {
  team: string;
  yellow: number;
  red: number;
}

/** Auto-utledet krydder-fasit (engelske lagnavn → tidligste noon-ISO-dato). */
export interface AutoBonus {
  q7?: Record<string, string>; // rødt kort: lag → dato
  q8?: Record<string, string>; // selvmål: lag → dato
}

export interface StatsData {
  topScorers: StatPlayer[];
  topAssists: StatPlayer[];
  topCards: StatPlayer[];
  teamCards: TeamCard[];
  autoBonus?: AutoBonus;
  goalsByPlayer?: Record<string, number>; // spiller-id → mål (for q13)
  playedIds?: number[]; // spillere m/ spilletid (for q16)
  playedAt?: Record<string, string | boolean>; // spiller-id → tidligste kampdag (noon-ISO) – daterer q16
  matchYellows?: Record<string, number>; // apiId → antall gule kort (for q19)
  matchReds?: Record<string, number>; // apiId → antall røde kort (custom auto: rødt kort-kamp)
  matchPenaltyGoals?: Record<string, number>; // apiId → straffemål i åpent spill (custom auto)
  matchCardedPlayers?: Record<string, string[]>; // apiId → spillere m/ kort (custom auto: kort-spillere)
  matchFirstGoal?: Record<string, number | null>; // apiId → tidligste mål-minutt, null = målløs (custom auto)
  matchLastRegGoal?: Record<string, number | null>; // apiId → siste mål-minutt i ordinær tid, null = ingen (custom auto)
  finalReferee?: string | null; // for q11
  fastestGoal?: { minute: number; scorer: string; team: string } | null; // for q6
  fastestGoals?: { minute: number; scorer: string; team: string }[]; // alle mål på laveste minutt (q6)
  goalMinutes?: number[]; // mål per 15-min-bolk (7 tall) – for «Nerding»
  coverage?: { cached: number; relevant: number };
  updatedAt?: number;
}

// Modul-cache: holder siste svar på tvers av fane-bytter, så Stats-fanen viser data umiddelbart.
let cached: StatsData | null = null;

/**
 * Henter aggregerte turneringsstatistikker fra /api/stats og poller mens `enabled`.
 * Inkluderer live-kamper, så topplistene oppdateres mens kamper pågår.
 */
export function useStats(enabled: boolean): { data: StatsData | null } {
  const [data, setData] = useState<StatsData | null>(cached);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/stats');
        if (!r.ok) return;
        const j = (await r.json()) as StatsData;
        if (!cancelled) {
          cached = j;
          setData(j);
        }
      } catch {
        /* behold forrige data */
      }
    };
    void load();
    const t = setInterval(load, 45000); // edge-cache 30s; poll litt sjeldnere
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled]);

  return { data };
}
