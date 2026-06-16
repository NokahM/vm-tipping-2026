import { TEAM_NAME_MAP } from './teamNames';

/** Fjerner diakritiske tegn (ç→c, é→e …) via NFD-dekomponering. */
const stripDia = (s: string) =>
  [...s.normalize('NFD')]
    .filter((c) => {
      const x = c.charCodeAt(0);
      return x < 0x0300 || x > 0x036f;
    })
    .join('');

// Åpenbare feilstavinger → kanonisk (diakritisk-strippet, lowercase) nøkkel.
// Verdiene er det «riktige» navnet sin nøkkel, så feilstaving og korrekt staving matcher.
const SPELLING_ALIASES: Record<string, string> = {
  curacau: 'curacao', // Curacau → Curaçao
};

/**
 * Diakritisk-insensitiv + feilstavings-tolerant nøkkel for sammenligning/matching.
 * «Curaçao», «Curacao» og «Curacau» gir alle samme nøkkel «curacao».
 */
export function spellKey(s: string): string {
  const k = stripDia(s).toLowerCase().trim();
  return SPELLING_ALIASES[k] ?? k;
}

// Nøkkel → kanonisk norsk lagnavn (for visning).
const KEY_TO_NAME = new Map<string, string>();
for (const no of new Set(Object.values(TEAM_NAME_MAP))) KEY_TO_NAME.set(spellKey(no), no);

/** Kanonisk norsk lagnavn (Curacau/Curacao → Curaçao), ellers input uendret. */
export function canonTeam(s: string): string {
  return KEY_TO_NAME.get(spellKey(s)) ?? s.trim();
}
