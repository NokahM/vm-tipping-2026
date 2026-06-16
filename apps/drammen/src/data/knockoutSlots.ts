/**
 * Bracket-plassholdere for sluttspillet – vises mens lagene er TBD (API-et har ingen slik info).
 * Nøkkel = football-data `apiId`. Byttes automatisk ut med ekte lag når API-et fyller dem inn.
 *
 * R32 = FIFA Match 73–88. Merk: football-data sine id-er følger IKKE matchnumrene, men FIFA
 * nummererer kampene kronologisk, så Match 73 = tidligste R32-kamp osv. Kommentaren viser
 * matchnr + dato (norsk) + original engelsk parring for enkel verifisering.
 * Kompakte norske labels pga. bredde: «Vinner X», «2-er X» (runner-up), «3-er XYZ» (beste 3.-plass).
 */
export const KNOCKOUT_SLOTS: Record<number, { home: string; away: string }> = {
  537417: { home: '2-er A', away: '2-er B' }, // M73 28.6 – Runner-up A vs Runner-up B
  537423: { home: 'Vinner E', away: '3-er ABCDF' }, // M74 29.6 – Winner E vs Best 3rd A/B/C/D/F
  537415: { home: 'Vinner F', away: '2-er C' }, // M75 29.6 – Winner F vs Runner-up C
  537418: { home: 'Vinner C', away: '2-er F' }, // M76 30.6 – Winner C vs Runner-up F
  537424: { home: 'Vinner I', away: '3-er CDFGH' }, // M77 30.6 – Winner I vs Best 3rd C/D/F/G/H
  537416: { home: '2-er E', away: '2-er I' }, // M78 30.6 – Runner-up E vs Runner-up I
  537425: { home: 'Vinner A', away: '3-er CEFHI' }, // M79 1.7 – Winner A vs Best 3rd C/E/F/H/I
  537426: { home: 'Vinner L', away: '3-er EHIJK' }, // M80 1.7 – Winner L vs Best 3rd E/H/I/J/K
  537422: { home: 'Vinner D', away: '3-er BEFIJ' }, // M81 1.7 – Winner D vs Best 3rd B/E/F/I/J
  537421: { home: 'Vinner G', away: '3-er AEHIJ' }, // M82 2.7 – Winner G vs Best 3rd A/E/H/I/J
  537420: { home: '2-er K', away: '2-er L' }, // M83 2.7 – Runner-up K vs Runner-up L
  537419: { home: 'Vinner H', away: '2-er J' }, // M84 3.7 – Winner H vs Runner-up J
  537429: { home: 'Vinner B', away: '3-er EFGIJ' }, // M85 3.7 – Winner B vs Best 3rd E/F/G/I/J
  537428: { home: 'Vinner J', away: '2-er H' }, // M86 3.7 – Winner J vs Runner-up H
  537427: { home: 'Vinner K', away: '3-er DEIJL' }, // M87 4.7 – Winner K vs Best 3rd D/E/I/J/L
  537430: { home: '2-er D', away: '2-er G' }, // M88 4.7 – Runner-up D vs Runner-up G
};

/** Plassholder-label for en TBD-sluttspillkamp, eller null hvis vi ikke har den. */
export function koSlotLabel(apiId: number, side: 'home' | 'away'): string | null {
  return KNOCKOUT_SLOTS[apiId]?.[side] ?? null;
}
