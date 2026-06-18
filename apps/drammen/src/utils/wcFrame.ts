import type { CSSProperties } from 'react';

// Basisvarighet – må matche @keyframes wc-frame-cycle (index.css). Hver ramme får en liten
// avvik fra denne (se under), så det er ikke en hard match lenger, men sentrum av spennet.
const BASE_PERIOD_S = 32;
// Gylden ratio (frac) – gir «sunflower»-spredning: påfølgende kall havner maksimalt langt fra
// hverandre i syklusen, uansett hvor mange rammer som finnes.
const GOLDEN = 0.618033988749895;

// Modul-teller: hver .wc-frame-ramme får neste indeks i mount-rekkefølge. Beholdes på tvers av
// fane-bytter (nye rammer fortsetter sekvensen), så spredningen holder seg jevn hele tiden.
let frameIndex = 0;

/**
 * Gir .wc-frame-rammen en **jevnt spredt** startfase + en **liten** hastighetsvariasjon, så
 * rammene ikke veksler farge i lås:
 * - Startfase via golden-angle (`animation-delay`): naboer i sekvensen ligger ~0.38 av syklusen
 *   fra hverandre – mye jevnere enn ren `Math.random()`, som klumper seg.
 * - Varighet ±~5 % (`animation-duration`): to rammer som starter nær hverandre **drifter** sakte
 *   fra hverandre over tid i stedet for å låses sammen (alle gikk før i nøyaktig samme tempo).
 * Kall én gang per ramme (memoisert) – hver ramme får da sin egen faste fase + tempo.
 */
export function wcFrameStyle(): CSSProperties {
  const i = frameIndex++;
  const phase = (i * GOLDEN) % 1; // 0..1: hvor i fargesyklusen rammen starter
  // Egen golden-spredning for tempo (annen multiplikator → ukorrelert med fasen).
  const speedSpread = ((i * GOLDEN * 2) % 1) - 0.5; // -0.5..0.5
  const duration = BASE_PERIOD_S * (1 + speedSpread * 0.1); // ~30.4–33.6 s (±5 %)
  return {
    animationDuration: `${duration.toFixed(2)}s`,
    animationDelay: `-${(phase * duration).toFixed(2)}s`,
  };
}
