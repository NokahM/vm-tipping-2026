/**
 * Sluttspill-metadata per kamp – vises mens lagene er TBD (API-et har ingen slik info).
 * Nøkkel = football-data `apiId`. `num` = FIFAs kampnummer. `home`/`away` = bracket-plassholder
 * (kompakte norske labels pga. bredde: «Vinner X»/«2-er X»/«3-er XYZ» (gruppe-plassering i R32),
 * «Vinner K73»/«Taper K101» (vinner/taper av en tidligere kamp i R16→finale)).
 *
 * VIKTIG: FIFAs kampnumre er IKKE kronologiske, og football-data sine id-er følger heller ikke
 * numrene. ALT er derfor mappet eksakt via dato/klokkeslett mot API-et (verifisert 16/16 + 16/16).
 */
export const KNOCKOUT_SLOTS: Record<number, { num: number; home?: string; away?: string }> = {
  // Sekstendelsfinaler (R32) – Kamp 73–88
  537417: { num: 73, home: '2-er A', away: '2-er B' },
  537415: { num: 74, home: 'Vinner E', away: '3-er ABCDF' },
  537418: { num: 75, home: 'Vinner F', away: '2-er C' },
  537423: { num: 76, home: 'Vinner C', away: '2-er F' },
  537416: { num: 77, home: 'Vinner I', away: '3-er CDFGH' },
  537424: { num: 78, home: '2-er E', away: '2-er I' },
  537425: { num: 79, home: 'Vinner A', away: '3-er CEFHI' },
  537426: { num: 80, home: 'Vinner L', away: '3-er EHIJK' },
  537421: { num: 81, home: 'Vinner D', away: '3-er BEFIJ' },
  537422: { num: 82, home: 'Vinner G', away: '3-er AEHIJ' },
  537419: { num: 83, home: '2-er K', away: '2-er L' },
  537420: { num: 84, home: 'Vinner H', away: '2-er J' },
  537429: { num: 85, home: 'Vinner B', away: '3-er EFGIJ' },
  537427: { num: 86, home: 'Vinner J', away: '2-er H' },
  537430: { num: 87, home: 'Vinner K', away: '3-er DEIJL' },
  537428: { num: 88, home: '2-er D', away: '2-er G' },
  // Åttendelsfinaler (R16) – Kamp 89–96
  537375: { num: 89, home: 'Vinner K74', away: 'Vinner K77' },
  537376: { num: 90, home: 'Vinner K73', away: 'Vinner K75' },
  537377: { num: 91, home: 'Vinner K76', away: 'Vinner K78' },
  537378: { num: 92, home: 'Vinner K79', away: 'Vinner K80' },
  537379: { num: 93, home: 'Vinner K83', away: 'Vinner K84' },
  537380: { num: 94, home: 'Vinner K81', away: 'Vinner K82' },
  537381: { num: 95, home: 'Vinner K86', away: 'Vinner K88' },
  537382: { num: 96, home: 'Vinner K85', away: 'Vinner K87' },
  // Kvartfinaler – Kamp 97–100
  537383: { num: 97, home: 'Vinner K89', away: 'Vinner K90' },
  537384: { num: 98, home: 'Vinner K93', away: 'Vinner K94' },
  537385: { num: 99, home: 'Vinner K91', away: 'Vinner K92' },
  537386: { num: 100, home: 'Vinner K95', away: 'Vinner K96' },
  // Semifinaler – Kamp 101–102
  537387: { num: 101, home: 'Vinner K97', away: 'Vinner K98' },
  537388: { num: 102, home: 'Vinner K99', away: 'Vinner K100' },
  // Bronsefinale – Kamp 103
  537389: { num: 103, home: 'Taper K101', away: 'Taper K102' },
  // Finale – Kamp 104
  537390: { num: 104, home: 'Vinner K101', away: 'Vinner K102' },
};

/** Plassholder-label for en TBD-sluttspillkamp, eller null hvis vi ikke har den. */
export function koSlotLabel(apiId: number, side: 'home' | 'away'): string | null {
  return KNOCKOUT_SLOTS[apiId]?.[side] ?? null;
}

/** FIFAs kampnummer for en sluttspillkamp, eller null. */
export function koMatchNumber(apiId: number): number | null {
  return KNOCKOUT_SLOTS[apiId]?.num ?? null;
}
