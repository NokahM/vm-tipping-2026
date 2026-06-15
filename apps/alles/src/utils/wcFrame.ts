import type { CSSProperties } from 'react';

// Må matche varigheten i @keyframes wc-frame-cycle (index.css).
const WC_FRAME_PERIOD_S = 32;

/**
 * Faselåser .wc-frame-rammens fargesyklus til veggklokka via en negativ animation-delay.
 * Slik «starter» ikke rammen på rød ved hver fane-bytte/remount, men viser alltid fargen
 * for akkurat nå – så alle rammer er synkronisert og bytter sømløst når man veksler fane.
 */
export function wcFrameStyle(): CSSProperties {
  return { animationDelay: `-${(Date.now() / 1000) % WC_FRAME_PERIOD_S}s` };
}
