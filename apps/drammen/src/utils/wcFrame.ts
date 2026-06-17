import type { CSSProperties } from 'react';

// Må matche varigheten i @keyframes wc-frame-cycle (index.css).
const WC_FRAME_PERIOD_S = 32;

/**
 * Gir .wc-frame-rammen en **tilfeldig** startfase i fargesyklusen (negativ animation-delay),
 * så rammene ikke veksler farge i lås med hverandre (ellers ville alle startet på rød samtidig).
 * Kall én gang per ramme (memoisert) – hver ramme får da sin egen faste, tilfeldige fase.
 */
export function wcFrameStyle(): CSSProperties {
  return { animationDelay: `-${(Math.random() * WC_FRAME_PERIOD_S).toFixed(2)}s` };
}
