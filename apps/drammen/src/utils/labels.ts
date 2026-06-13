import type { Stage } from '../types';

export const STAGE_LABELS: Record<Stage, string> = {
  GROUP_STAGE: 'Gruppespill',
  ROUND_OF_32: 'Sekstendelsfinaler',
  ROUND_OF_16: 'Åttendelsfinaler',
  QUARTER_FINALS: 'Kvartfinaler',
  SEMI_FINALS: 'Semifinaler',
  THIRD_PLACE: 'Bronsefinale',
  FINAL: 'Finale',
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

const timeFmt = new Intl.DateTimeFormat('no-NO', { hour: '2-digit', minute: '2-digit' });

/** Klokkeslett for "Sist oppdatert". */
export function formatTime(date: Date): string {
  return timeFmt.format(date);
}
