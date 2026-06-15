import type { MatchResult } from '../types';

/** Én rad i en gruppetabell (rått, engelsk lagnavn fra API i `team`). */
export interface GroupRow {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface GroupTable {
  group: string; // f.eks. "GROUP_A"
  letter: string; // f.eks. "A"
  rows: GroupRow[];
}

/**
 * Beregner gruppetabeller fra kampresultatene. Teller kun **FINISHED**-kamper (som
 * resten av appen – live påvirker ikke tabellen), men lister alle kjente lag i gruppa
 * (også de med 0 spilte). Sortering: poeng → målforskjell → scorede mål → navn.
 * (Forenklet ift. FIFAs fulle tie-break-regler, men greit for visning.)
 */
export function computeGroupTables(results: MatchResult[]): GroupTable[] {
  const byGroup = new Map<string, Map<string, GroupRow>>();

  const ensure = (group: string, team: string): GroupRow => {
    let g = byGroup.get(group);
    if (!g) {
      g = new Map();
      byGroup.set(group, g);
    }
    let r = g.get(team);
    if (!r) {
      r = { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
      g.set(team, r);
    }
    return r;
  };

  const isGroup = (m: MatchResult) => m.stage === 'GROUP_STAGE' && !!m.group;

  // 1) Registrer alle kjente lag i hver gruppe (også før de har spilt).
  for (const m of results) {
    if (!isGroup(m)) continue;
    if (m.homeTeam !== 'TBD') ensure(m.group as string, m.homeTeam);
    if (m.awayTeam !== 'TBD') ensure(m.group as string, m.awayTeam);
  }

  // 2) Akkumuler resultater fra ferdigspilte kamper.
  for (const m of results) {
    if (!isGroup(m) || m.status !== 'FINISHED') continue;
    if (m.homeGoals == null || m.awayGoals == null) continue;
    if (m.homeTeam === 'TBD' || m.awayTeam === 'TBD') continue;

    const h = ensure(m.group as string, m.homeTeam);
    const a = ensure(m.group as string, m.awayTeam);
    h.played++;
    a.played++;
    h.gf += m.homeGoals;
    h.ga += m.awayGoals;
    a.gf += m.awayGoals;
    a.ga += m.homeGoals;
    if (m.homeGoals > m.awayGoals) {
      h.won++;
      h.points += 3;
      a.lost++;
    } else if (m.homeGoals < m.awayGoals) {
      a.won++;
      a.points += 3;
      h.lost++;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }

  const tables: GroupTable[] = [];
  for (const [group, teams] of byGroup) {
    const rows = [...teams.values()];
    for (const r of rows) r.gd = r.gf - r.ga;
    rows.sort(
      (x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team),
    );
    tables.push({ group, letter: group.replace('GROUP_', ''), rows });
  }
  tables.sort((a, b) => a.letter.localeCompare(b.letter));
  return tables;
}
