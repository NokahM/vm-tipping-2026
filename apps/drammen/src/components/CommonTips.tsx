import { useMemo } from 'react';
import type { Participant } from '../types';
import { wcFrameStyle } from '../utils/wcFrame';

/** «Vanligste tips»: hyppigste resultat-tips (gruppespill + sluttspill) på tvers av alle deltakere. */
export default function CommonTips({ participants = [] }: { participants?: Participant[] }) {
  const frameStyle = useMemo(wcFrameStyle, []);

  const commonTips = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of participants) {
      const tips = [...(p.groupTips ?? []), ...(p.knockoutTips ?? [])];
      for (const t of tips) {
        if (t.homeGoals == null || t.awayGoals == null) continue;
        // Slår sammen speilvendte resultater (2–1 og 1–2 telles likt), høyest først.
        const hi = Math.max(t.homeGoals, t.awayGoals);
        const lo = Math.min(t.homeGoals, t.awayGoals);
        const key = `${hi}–${lo}`;
        m.set(key, (m.get(key) ?? 0) + 1);
      }
    }
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [participants]);
  const totalTips = commonTips.reduce((a, [, n]) => a + n, 0);
  const maxTip = Math.max(1, ...commonTips.map(([, n]) => n));

  return (
    <div style={frameStyle} className="wc-frame overflow-hidden rounded-xl bg-slate-800">
      <div className="border-b border-slate-700/70 px-3 py-1.5 text-sm font-semibold text-slate-200">
        Vanligste tips
      </div>
      {totalTips === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-500">Ingen tips registrert ennå.</p>
      ) : (
        <ul className="space-y-1 px-3 py-2">
          {commonTips.map(([score, n]) => (
            <li key={score} className="flex items-center gap-2 text-[11px]">
              <span className="w-9 shrink-0 tabular-nums text-slate-300">{score}</span>
              <div className="flex h-3 flex-1 overflow-hidden rounded bg-slate-900/70">
                <div className="bg-wc-lime" style={{ width: `${(n / maxTip) * 100}%` }} />
              </div>
              <span className="w-6 shrink-0 text-right tabular-nums text-slate-400">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
