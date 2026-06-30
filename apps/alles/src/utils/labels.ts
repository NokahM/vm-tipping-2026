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
 * Tilleggsinfo for sluttspillskamper avgjort etter 90 min (ekstraomganger/straffer).
 * Hovedstillingen (homeGoals–awayGoals) er alltid resultatet etter 90 min – det tips scores mot.
 * Dette gir en kompakt indikator (`short`) + en utfyllende linje (`detail`, vist ved klikk).
 * Orientering er hjemme–borte, som hovedstillingen. `null` for vanlige kamper.
 */
export function extraTimeResult(m: MatchResult): { short: string; detail: string } | null {
  if (m.status !== 'FINISHED') return null;
  if (m.duration !== 'EXTRA_TIME' && m.duration !== 'PENALTY_SHOOTOUT') return null;

  const short: string[] = [];
  const detail: string[] = [];

  // Ekstraomgangsmål endret stillingen → vis det fulle spille-resultatet.
  const { aetHomeGoals: ah, aetAwayGoals: aa } = m;
  const etChanged = ah != null && aa != null && (ah !== m.homeGoals || aa !== m.awayGoals);
  if (etChanged) {
    short.push(`e.o. ${ah}–${aa}`);
    detail.push(`Etter ekstraomganger ${ah}–${aa}`);
  } else if (m.duration === 'EXTRA_TIME') {
    short.push('e.o.');
    detail.push('Avgjort i ekstraomganger');
  }

  if (m.duration === 'PENALTY_SHOOTOUT' && m.penHomeGoals != null && m.penAwayGoals != null) {
    short.push(`str. ${m.penHomeGoals}–${m.penAwayGoals}`);
    detail.push(`Straffer ${m.penHomeGoals}–${m.penAwayGoals}`);
  }

  if (short.length === 0) return null;
  return { short: short.join(' · '), detail: detail.join(' · ') };
}

const timeFmt = new Intl.DateTimeFormat('no-NO', { hour: '2-digit', minute: '2-digit' });

/** Klokkeslett for "Sist oppdatert". */
export function formatTime(date: Date): string {
  return timeFmt.format(date);
}
