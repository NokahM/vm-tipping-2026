import { useMemo } from 'react';
import type { Progression } from '../utils/progression';
import { wcFrameStyle } from '../utils/wcFrame';

// Samme WC-palett som utviklingsgrafen, så fargene kjennes igjen.
const COLORS = ['#e21602', '#afe905', '#66fbda', '#324dfb', '#b188fc', '#e84b09', '#e8fc4a', '#6001e6'];

const TAU = Math.PI * 2;
const polar = (cx: number, cy: number, r: number, a: number) => ({
  x: cx + r * Math.cos(a),
  y: cy + r * Math.sin(a),
});

/** Kakestykke-path fra `start` til `end` (radianer, 0 = topp via −90°-forskyvning i kallet). */
function slicePath(cx: number, cy: number, r: number, start: number, end: number): string {
  const p0 = polar(cx, cy, r, start);
  const p1 = polar(cx, cy, r, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
}

/**
 * «Dager på topp» som kakediagram: hver deltakers andel av alle ledelsesdager. For hver ekte
 * kampdag (hopper over den syntetiske start-dagen) finnes leder(e) = de med høyest kumulativ
 * total; **delt 1.-plass teller for alle**. Kun deltakere som har ledet minst én dag vises.
 */
export default function DaysLeading({ progression }: { progression: Progression }) {
  const frameStyle = useMemo(wcFrameStyle, []);

  const leaders = useMemo(() => {
    const { days, series } = progression;
    const count = new Map<string, number>();
    for (let i = 1; i < days.length; i++) {
      const max = Math.max(...series.map((s) => s.totals[i] ?? 0));
      if (max <= 0) continue; // ingen har poeng ennå → ingen leder
      for (const s of series) {
        if ((s.totals[i] ?? 0) === max) count.set(s.name, (count.get(s.name) ?? 0) + 1);
      }
    }
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'no'));
  }, [progression]);

  const total = leaders.reduce((a, [, d]) => a + d, 0);

  // Kakestykker (kumulative vinkler fra toppen).
  const slices = useMemo(() => {
    const out: { name: string; days: number; color: string; d: string }[] = [];
    let acc = -Math.PI / 2; // start på toppen
    leaders.forEach(([name, days], i) => {
      const end = acc + (days / total) * TAU;
      out.push({ name, days, color: COLORS[i % COLORS.length], d: slicePath(50, 50, 48, acc, end) });
      acc = end;
    });
    return out;
  }, [leaders, total]);

  return (
    <div style={frameStyle} className="wc-frame overflow-hidden rounded-xl bg-slate-800">
      <div className="border-b border-slate-700/70 px-3 py-1.5 text-sm font-semibold text-slate-200">
        Dager på topp
      </div>
      {leaders.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-500">Ingen har ledet ennå.</p>
      ) : (
        <div className="flex items-center gap-3 px-3 py-3">
          <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" role="img" aria-label="Dager på topp">
            {leaders.length === 1 ? (
              <circle cx="50" cy="50" r="48" fill={COLORS[0]} />
            ) : (
              slices.map((s) => <path key={s.name} d={s.d} fill={s.color} stroke="#1e293b" strokeWidth="0.6" />)
            )}
          </svg>
          <ul className="min-w-0 flex-1 space-y-1">
            {leaders.map(([name, d], i) => (
              <li key={name} className="flex items-center gap-2 text-[11px]">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="min-w-0 flex-1 truncate text-slate-200">{name}</span>
                <span className="shrink-0 tabular-nums text-slate-400">
                  {d} {d === 1 ? 'dag' : 'dager'}
                  <span className="text-slate-500"> · {Math.round((d / total) * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
