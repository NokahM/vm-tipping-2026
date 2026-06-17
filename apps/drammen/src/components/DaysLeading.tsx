import { useMemo } from 'react';
import type { Progression } from '../utils/progression';
import { wcFrameStyle } from '../utils/wcFrame';

/**
 * «Dager på topp»: hvor mange kampdager hver deltaker har ledet turneringen.
 * For hver ekte kampdag (hopper over den syntetiske start-dagen der alle står på 0) finnes
 * leder(e) = de med høyest kumulativ total; **delt 1.-plass teller for alle**. Kun deltakere
 * som har ledet minst én dag vises, sortert synkende.
 */
export default function DaysLeading({ progression }: { progression: Progression }) {
  const frameStyle = useMemo(wcFrameStyle, []);

  const leaders = useMemo(() => {
    const { days, series } = progression;
    const count = new Map<string, number>();
    // days[0] er syntetisk start-dag (alle på 0) → hopp over; tell fra første ekte kampdag.
    for (let i = 1; i < days.length; i++) {
      const max = Math.max(...series.map((s) => s.totals[i] ?? 0));
      if (max <= 0) continue; // ingen har poeng ennå → ingen leder
      for (const s of series) {
        if ((s.totals[i] ?? 0) === max) count.set(s.name, (count.get(s.name) ?? 0) + 1);
      }
    }
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'no'));
  }, [progression]);

  const maxDays = Math.max(1, ...leaders.map(([, d]) => d));

  return (
    <div style={frameStyle} className="wc-frame overflow-hidden rounded-xl bg-slate-800">
      <div className="border-b border-slate-700/70 px-3 py-1.5 text-sm font-semibold text-slate-200">
        Dager på topp
      </div>
      {leaders.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-500">Ingen har ledet ennå.</p>
      ) : (
        <ul className="space-y-1 px-3 py-2.5">
          {leaders.map(([name, d]) => (
            <li key={name} className="flex items-center gap-2 text-[11px]">
              <span className="min-w-0 flex-1 truncate text-slate-200">{name}</span>
              <div className="flex h-2.5 w-24 shrink-0 overflow-hidden rounded bg-slate-900/70">
                <div className="bg-wc-lime" style={{ width: `${(d / maxDays) * 100}%` }} />
              </div>
              <span className="w-14 shrink-0 text-right tabular-nums text-slate-400">
                {d} {d === 1 ? 'dag' : 'dager'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
