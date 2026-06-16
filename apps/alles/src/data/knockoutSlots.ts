/**
 * Sluttspill-metadata per kamp – vises mens lagene er TBD (API-et har ingen slik info).
 * Nøkkel = football-data `apiId`. `num` = FIFAs kampnummer. `home`/`away` = bracket-plassholder
 * (kompakte norske labels pga. bredde: «Vinner X», «2-er X» (runner-up), «3-er XYZ» (beste 3.-plass)).
 *
 * VIKTIG: FIFAs kampnumre er IKKE kronologiske, og football-data sine id-er følger heller ikke
 * numrene. R32 (Kamp 73–88) er derfor mappet eksakt via dato/klokkeslett mot API-et (verifisert
 * 16/16). R16→kvart→semi (Kamp 89–102) mangler bevisst til skjemaet er verifisert på samme måte;
 * bronse (103) og finale (104) er logisk sikre (eneste kamp helt til slutt).
 */
export const KNOCKOUT_SLOTS: Record<number, { num: number; home?: string; away?: string }> = {
  // Sekstendelsfinaler (R32) – Kamp 73–88, verifisert mot API via dato/klokkeslett.
  537417: { num: 73, home: '2-er A', away: '2-er B' }, // 28.6 – Runner-up A vs Runner-up B
  537415: { num: 74, home: 'Vinner E', away: '3-er ABCDF' }, // 29.6 – Winner E vs Best 3rd A/B/C/D/F
  537418: { num: 75, home: 'Vinner F', away: '2-er C' }, // 30.6 – Winner F vs Runner-up C
  537423: { num: 76, home: 'Vinner C', away: '2-er F' }, // 29.6 – Winner C vs Runner-up F
  537416: { num: 77, home: 'Vinner I', away: '3-er CDFGH' }, // 30.6 – Winner I vs Best 3rd C/D/F/G/H
  537424: { num: 78, home: '2-er E', away: '2-er I' }, // 30.6 – Runner-up E vs Runner-up I
  537425: { num: 79, home: 'Vinner A', away: '3-er CEFHI' }, // 1.7 – Winner A vs Best 3rd C/E/F/H/I
  537426: { num: 80, home: 'Vinner L', away: '3-er EHIJK' }, // 1.7 – Winner L vs Best 3rd E/H/I/J/K
  537421: { num: 81, home: 'Vinner D', away: '3-er BEFIJ' }, // 2.7 – Winner D vs Best 3rd B/E/F/I/J
  537422: { num: 82, home: 'Vinner G', away: '3-er AEHIJ' }, // 1.7 – Winner G vs Best 3rd A/E/H/I/J
  537419: { num: 83, home: '2-er K', away: '2-er L' }, // 2.7 – Runner-up K vs Runner-up L
  537420: { num: 84, home: 'Vinner H', away: '2-er J' }, // 2.7 – Winner H vs Runner-up J
  537429: { num: 85, home: 'Vinner B', away: '3-er EFGIJ' }, // 3.7 – Winner B vs Best 3rd E/F/G/I/J
  537427: { num: 86, home: 'Vinner J', away: '2-er H' }, // 3.7 – Winner J vs Runner-up H
  537430: { num: 87, home: 'Vinner K', away: '3-er DEIJL' }, // 4.7 – Winner K vs Best 3rd D/E/I/J/L
  537428: { num: 88, home: '2-er D', away: '2-er G' }, // 3.7 – Runner-up D vs Runner-up G
  // Bronsefinale + finale – logisk sikre (eneste kamp helt til slutt).
  537389: { num: 103 }, // Bronsefinale
  537390: { num: 104 }, // Finale
};

/** Plassholder-label for en TBD-sluttspillkamp, eller null hvis vi ikke har den. */
export function koSlotLabel(apiId: number, side: 'home' | 'away'): string | null {
  return KNOCKOUT_SLOTS[apiId]?.[side] ?? null;
}

/** FIFAs kampnummer for en sluttspillkamp, eller null. */
export function koMatchNumber(apiId: number): number | null {
  return KNOCKOUT_SLOTS[apiId]?.num ?? null;
}
