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
 * «Dager på topp» som kakediagram. For hver ekte kampdag (hopper over den syntetiske start-dagen)
 * finnes leder(e) = de med høyest kumulativ total. **Rettferdig kake:** hver dag er én enhet som
 * **deles likt** mellom medledere (delt 1.-plass → ⅓ hver av tre), så kake-andelene summerer ekte
 * til 100 % og soloførsteplasser belønnes. I tillegg telles hele **dager på topp** (delt teller
 * fullt) som overskrift-tall. Kun deltakere som har ledet minst én dag vises.
 */
export default function DaysLeading({ progression }: { progression: Progression }) {
  const frameStyle = useMemo(wcFrameStyle, []);

  const leaders = useMemo(() => {
    const { days, series } = progression;
    const dayCount = new Map<string, number>(); // hele dager på topp (delt teller fullt)
    const share = new Map<string, number>(); // rettferdig andel (delt dag splittes likt)
    for (let i = 1; i < days.length; i++) {
      const max = Math.max(...series.map((s) => s.totals[i] ?? 0));
      if (max <= 0) continue; // ingen har poeng ennå → ingen leder
      const dayLeaders = series.filter((s) => (s.totals[i] ?? 0) === max);
      for (const s of dayLeaders) {
        dayCount.set(s.name, (dayCount.get(s.name) ?? 0) + 1);
        share.set(s.name, (share.get(s.name) ?? 0) + 1 / dayLeaders.length);
      }
    }
    // Sorter på rettferdig andel (synkende), så hele dager, så navn – stabil og meningsfull rekkefølge.
    return [...dayCount.keys()]
      .map((name) => ({ name, days: dayCount.get(name)!, share: share.get(name) ?? 0 }))
      .sort((a, b) => b.share - a.share || b.days - a.days || a.name.localeCompare(b.name, 'no'));
  }, [progression]);

  // Nevner = sum av andeler = antall reelle ledelsesdager → kaken summerer til 100 %.
  const total = leaders.reduce((a, l) => a + l.share, 0);

  // Kakestykker (kumulative vinkler fra toppen), proporsjonale med rettferdig andel.
  const slices = useMemo(() => {
    const out: { name: string; color: string; d: string }[] = [];
    let acc = -Math.PI / 2; // start på toppen
    leaders.forEach((l, i) => {
      const end = acc + (l.share / total) * TAU;
      out.push({ name: l.name, color: COLORS[i % COLORS.length], d: slicePath(50, 50, 48, acc, end) });
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
            {leaders.map((l, i) => (
              <li key={l.name} className="flex items-center gap-2 text-[11px]">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="min-w-0 flex-1 truncate text-slate-200">{l.name}</span>
                <span className="shrink-0 tabular-nums text-slate-400">
                  {l.days} {l.days === 1 ? 'dag' : 'dager'}
                  <span className="text-slate-500"> · {Math.round((l.share / total) * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
