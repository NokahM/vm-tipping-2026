import type { MatchResult, Stage } from '../types';

export const STAGE_LABELS: Record<Stage, string> = {
  GROUP_STAGE: 'Gruppespill',
  ROUND_OF_32: 'Sekstendelsfinaler',
  ROUND_OF_16: 'Åttendelsfinaler',
  QUARTER_FINALS: 'Kvartfinaler',
  SEMI_FINALS: 'Semifinaler',
  THIRD_PLACE: 'Bronsefinale',
  FINAL: 'Finale',
};

/**
 * Farge-triade (kant/bakgrunn/tekst) per runde for krydder-runde-badgen. Distinkte WC-farger så
 * rundene skilles på et blikk, med økende «temperatur» mot finalen. LITERAL klasse-strenger –
 * Tailwind skanner denne fila og må se hele klassenavnet (ingen dynamisk `wc-${x}`-bygging).
 */
export const STAGE_BADGE: Record<Stage, string> = {
  GROUP_STAGE: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
  ROUND_OF_32: 'border-wc-mint/40 bg-wc-mint/15 text-wc-mint',
  ROUND_OF_16: 'border-wc-lavender/40 bg-wc-lavender/15 text-wc-lavender',
  QUARTER_FINALS: 'border-wc-lime/40 bg-wc-lime/15 text-wc-lime',
  SEMI_FINALS: 'border-wc-orange/40 bg-wc-orange/15 text-wc-orange',
  THIRD_PLACE: 'border-wc-yellow/40 bg-wc-yellow/15 text-wc-yellow',
  FINAL: 'border-wc-red/40 bg-wc-red/15 text-wc-red',
};

/** Kun tekstfargen per runde – admin sin kompakte inline-etikett (samme farger som badgen). */
export const STAGE_TEXT: Record<Stage, string> = {
  GROUP_STAGE: 'text-slate-300',
  ROUND_OF_32: 'text-wc-mint',
  ROUND_OF_16: 'text-wc-lavender',
  QUARTER_FINALS: 'text-wc-lime',
  SEMI_FINALS: 'text-wc-orange',
  THIRD_PLACE: 'text-wc-yellow',
  FINAL: 'text-wc-red',
};

/** Rekkefølge for visning av runder. */
export const STAGE_ORDER: Stage[] = [
  'GROUP_STAGE',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
];

/** "GROUP_A" → "Gruppe A". */
export function groupLabel(group: string): string {
  return group.replace('GROUP_', 'Gruppe ');
}

const dateFmt = new Intl.DateTimeFormat('no-NO', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

// Tre faste mellomrom (U+00A0) mellom dato og tid, så de ikke kollapser i HTML.
const KICKOFF_GAP = String.fromCharCode(0x00a0).repeat(3);

/** ISO-dato → "11.06   21:00" (lokal tid, med litt luft mellom dato og tid). */
export function formatKickoff(utcDate: string): string {
  const s = dateFmt.format(new Date(utcDate)).replace(',', '');
  const [date, time] = s.split(/\s+/);
  return time ? `${date}${KICKOFF_GAP}${time}` : s;
}

/**
 * Kompakt indikator for sluttspillskamper avgjort etter 90 min (ekstraomganger/straffer), vist
 * under hovedstillingen på kampraden – f.eks. «e.o. 3–2» eller «str. 2–3». Hovedstillingen
 * (homeGoals–awayGoals) er alltid resultatet etter 90 min – det tips scores mot. Orientering er
 * hjemme–borte, som hovedstillingen. `null` for vanlige kamper. (I den utvidede tidslinjen avsløres
 * fasen av minuttene + straffekonk-grafikken, så ingen tekst-linje der.)
 */
export function extraTimeResult(m: MatchResult): string | null {
  if (m.status !== 'FINISHED') return null;
  if (m.duration !== 'EXTRA_TIME' && m.duration !== 'PENALTY_SHOOTOUT') return null;

  const parts: string[] = [];

  // Ekstraomgangsmål endret stillingen → vis det fulle spille-resultatet.
  const { aetHomeGoals: ah, aetAwayGoals: aa } = m;
  const etChanged = ah != null && aa != null && (ah !== m.homeGoals || aa !== m.awayGoals);
  if (etChanged) parts.push(`e.o. ${ah}–${aa}`);
  else if (m.duration === 'EXTRA_TIME') parts.push('e.o.');

  if (m.duration === 'PENALTY_SHOOTOUT' && m.penHomeGoals != null && m.penAwayGoals != null) {
    parts.push(`str. ${m.penHomeGoals}–${m.penAwayGoals}`);
  }

  return parts.length ? parts.join(' · ') : null;
}

const timeFmt = new Intl.DateTimeFormat('no-NO', { hour: '2-digit', minute: '2-digit' });

/** Klokkeslett for "Sist oppdatert". */
export function formatTime(date: Date): string {
  return timeFmt.format(date);
}
