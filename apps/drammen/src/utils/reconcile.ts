import type { MatchResult } from '../types';

/** Sant når kampen er ferdigspilt med et faktisk resultat. */
function isResolved(m: MatchResult): boolean {
  return m.status === 'FINISHED' && m.homeGoals !== null && m.awayGoals !== null;
}

/**
 * Fletter et nytt API-svar med det forrige, slik at en kamp som allerede var
 * ferdigspilt med resultat ALDRI degraderes til blank/uferdig pga. en API-hikke.
 *
 * - Er den nye versjonen ferdig med resultat → bruk den (sluttresultat er endelig).
 * - Ellers, hvis den gamle var ferdig med resultat → behold den gamle.
 * - Ferdige kamper som forsvinner helt fra det nye svaret beholdes også.
 */
export function reconcileResults(prev: MatchResult[], next: MatchResult[]): MatchResult[] {
  if (prev.length === 0) return next;

  const prevById = new Map(prev.map((m) => [m.apiId, m]));
  const merged = next.map((m) => {
    if (isResolved(m)) return m;
    const old = prevById.get(m.apiId);
    return old && isResolved(old) ? old : m;
  });

  const nextIds = new Set(next.map((m) => m.apiId));
  for (const old of prev) {
    if (isResolved(old) && !nextIds.has(old.apiId)) merged.push(old);
  }
  return merged;
}
