import { useMemo } from 'react';
import type { ParticipantScore } from '../types';
import { wcFrameStyle } from '../utils/wcFrame';

interface Seg {
  value: number;
  cls: string;
}

/** Horisontal stablet søyle (andeler av `total`). */
function StackBar({ segs, total }: { segs: Seg[]; total: number }) {
  return (
    <div className="flex h-3 flex-1 overflow-hidden rounded bg-slate-900/70">
      {total > 0 &&
        segs.map((seg, i) =>
          seg.value > 0 ? (
            <div key={i} className={seg.cls} style={{ width: `${(seg.value / total) * 100}%` }} />
          ) : null,
        )}
    </div>
  );
}

function Legend({ items }: { items: { cls: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 py-1.5 text-[10px] text-slate-500">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-sm ${it.cls}`} /> {it.label}
        </span>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const frameStyle = useMemo(wcFrameStyle, []);
  return (
    <div style={frameStyle} className="wc-frame overflow-hidden rounded-xl bg-slate-800">
      <div className="border-b border-slate-700/70 px-3 py-1.5 text-sm font-semibold text-slate-200">
        {title}
      </div>
      {children}
    </div>
  );
}

/** Deltager-stats: treffsikkerhet (eksakt/utfall/bom) + poeng-kilde (gruppe/sluttspill/krydder). */
export default function ParticipantStats({ standings }: { standings: ParticipantScore[] }) {
  const accuracy = useMemo(
    () =>
      standings
        .map((s) => {
          const tot = s.correctResults + s.correctOutcomes + s.wrongOutcomes;
          return { ...s, tot, exactPct: tot ? s.correctResults / tot : 0 };
        })
        .filter((s) => s.tot > 0)
        .sort((a, b) => b.exactPct - a.exactPct || b.correctResults - a.correctResults),
    [standings],
  );

  const bySource = useMemo(
    () => standings.filter((s) => s.total > 0).sort((a, b) => b.total - a.total),
    [standings],
  );

  return (
    <div className="space-y-3">
      <Card title="Treffsikkerhet">
        {accuracy.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Ingen ferdigspilte kamper ennå.</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-700/40">
              {accuracy.map((s) => (
                <li key={s.name} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <span className="w-16 shrink-0 truncate text-slate-100">{s.name}</span>
                  <StackBar
                    total={s.tot}
                    segs={[
                      { value: s.correctResults, cls: 'bg-emerald-500' },
                      { value: s.correctOutcomes, cls: 'bg-amber-500' },
                      { value: s.wrongOutcomes, cls: 'bg-red-500/70' },
                    ]}
                  />
                  <span className="w-9 shrink-0 text-right tabular-nums text-slate-300">
                    {Math.round(s.exactPct * 100)}%
                  </span>
                </li>
              ))}
            </ul>
            <Legend
              items={[
                { cls: 'bg-emerald-500', label: 'eksakt (3p)' },
                { cls: 'bg-amber-500', label: 'riktig utfall (1p)' },
                { cls: 'bg-red-500/70', label: 'bom' },
              ]}
            />
          </>
        )}
      </Card>

      <Card title="Poeng-kilde">
        {bySource.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Ingen poeng ennå.</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-700/40">
              {bySource.map((s) => (
                <li key={s.name} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <span className="w-16 shrink-0 truncate text-slate-100">{s.name}</span>
                  <StackBar
                    total={s.total}
                    segs={[
                      { value: s.groupPoints, cls: 'bg-wc-blue' },
                      { value: s.knockoutPoints, cls: 'bg-wc-mint' },
                      { value: s.bonusPoints, cls: 'bg-wc-lavender' },
                    ]}
                  />
                  <span className="w-7 shrink-0 text-right font-semibold tabular-nums text-slate-100">
                    {s.total}
                  </span>
                </li>
              ))}
            </ul>
            <Legend
              items={[
                { cls: 'bg-wc-blue', label: 'gruppespill' },
                { cls: 'bg-wc-mint', label: 'sluttspill' },
                { cls: 'bg-wc-lavender', label: 'krydder' },
              ]}
            />
          </>
        )}
      </Card>
    </div>
  );
}
