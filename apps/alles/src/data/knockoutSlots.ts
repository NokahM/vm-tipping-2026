/**
 * Sluttspill-metadata per kamp – vises mens lagene er TBD (API-et har ingen slik info).
 * Nøkkel = football-data `apiId`. `num` = FIFAs kampnummer (Kamp 73–104). `home`/`away` =
 * bracket-plassholder (kompakte norske labels pga. bredde: «Vinner X», «2-er X», «3-er XYZ»).
 *
 * Merk: football-data sine id-er følger IKKE kampnumrene, men FIFA nummererer kampene
 * kronologisk, så Kamp 73 = tidligste sluttspillkamp osv. R32 = Kamp 73–88 (med parringer);
 * R16→finale (89–104) har foreløpig bare nummer (parringer kan legges til senere).
 */
export const KNOCKOUT_SLOTS: Record<number, { num: number; home?: string; away?: string }> = {
  // Sekstendelsfinaler (R32) – Kamp 73–88
  537417: { num: 73, home: '2-er A', away: '2-er B' }, // Runner-up A vs Runner-up B
  537423: { num: 74, home: 'Vinner E', away: '3-er ABCDF' }, // Winner E vs Best 3rd A/B/C/D/F
  537415: { num: 75, home: 'Vinner F', away: '2-er C' }, // Winner F vs Runner-up C
  537418: { num: 76, home: 'Vinner C', away: '2-er F' }, // Winner C vs Runner-up F
  537424: { num: 77, home: 'Vinner I', away: '3-er CDFGH' }, // Winner I vs Best 3rd C/D/F/G/H
  537416: { num: 78, home: '2-er E', away: '2-er I' }, // Runner-up E vs Runner-up I
  537425: { num: 79, home: 'Vinner A', away: '3-er CEFHI' }, // Winner A vs Best 3rd C/E/F/H/I
  537426: { num: 80, home: 'Vinner L', away: '3-er EHIJK' }, // Winner L vs Best 3rd E/H/I/J/K
  537422: { num: 81, home: 'Vinner D', away: '3-er BEFIJ' }, // Winner D vs Best 3rd B/E/F/I/J
  537421: { num: 82, home: 'Vinner G', away: '3-er AEHIJ' }, // Winner G vs Best 3rd A/E/H/I/J
  537420: { num: 83, home: '2-er K', away: '2-er L' }, // Runner-up K vs Runner-up L
  537419: { num: 84, home: 'Vinner H', away: '2-er J' }, // Winner H vs Runner-up J
  537429: { num: 85, home: 'Vinner B', away: '3-er EFGIJ' }, // Winner B vs Best 3rd E/F/G/I/J
  537428: { num: 86, home: 'Vinner J', away: '2-er H' }, // Winner J vs Runner-up H
  537427: { num: 87, home: 'Vinner K', away: '3-er DEIJL' }, // Winner K vs Best 3rd D/E/I/J/L
  537430: { num: 88, home: '2-er D', away: '2-er G' }, // Runner-up D vs Runner-up G
  // Åttendelsfinaler (R16) – Kamp 89–96
  537376: { num: 89 },
  537375: { num: 90 },
  537377: { num: 91 },
  537378: { num: 92 },
  537379: { num: 93 },
  537380: { num: 94 },
  537381: { num: 95 },
  537382: { num: 96 },
  // Kvartfinaler – Kamp 97–100
  537383: { num: 97 },
  537384: { num: 98 },
  537385: { num: 99 },
  537386: { num: 100 },
  // Semifinaler – Kamp 101–102
  537387: { num: 101 },
  537388: { num: 102 },
  // Bronsefinale – Kamp 103
  537389: { num: 103 },
  // Finale – Kamp 104
  537390: { num: 104 },
};

/** Plassholder-label for en TBD-sluttspillkamp, eller null hvis vi ikke har den. */
export function koSlotLabel(apiId: number, side: 'home' | 'away'): string | null {
  return KNOCKOUT_SLOTS[apiId]?.[side] ?? null;
}

/** FIFAs kampnummer (73–104) for en sluttspillkamp, eller null. */
export function koMatchNumber(apiId: number): number | null {
  return KNOCKOUT_SLOTS[apiId]?.num ?? null;
}
