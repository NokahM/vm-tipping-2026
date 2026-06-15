import { useMemo, useState } from 'react';
import type { Progression } from '../utils/progression';

interface Props {
  progression: Progression;
}

// WC-palett-farger til linjene (sykler om det er flere enn 8 valgte).
const LINE_COLORS = [
  '#e21602',
  '#afe905',
  '#66fbda',
  '#324dfb',
  '#b188fc',
  '#e84b09',
  '#e8fc4a',
  '#6001e6',
];

// viewBox-koordinater (skalerer til full bredde via w-full).
const W = 340;
const H = 168;
const PAD = { left: 6, right: 6, top: 10, bottom: 16 };

function fmtDay(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`;
}

export default function ProgressionChart({ progression }: Props) {
  const { days, series } = progression;

  // Stabil farge per deltaker (etter plassering i serien).
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    series.forEach((s, i) => m.set(s.name, LINE_COLORS[i % LINE_COLORS.length]));
    return m;
  }, [series]);

  // Default: topp 3 (de tre med høyest sluttsum).
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(series.slice(0, 3).map((s) => s.name)),
  );

  if (days.length === 0) {
    return (
      <p className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-6 text-center text-sm text-slate-400">
        Ingen ferdigspilte kamper ennå – grafen fylles ut etter hvert.
      </p>
    );
  }

  const maxTotal = Math.max(1, ...series.map((s) => s.final));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (days.length > 1 ? i / (days.length - 1) : 0.5) * plotW;
  const y = (v: number) => PAD.top + (1 - v / maxTotal) * plotH;
  const baseline = y(0);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const shown = series.filter((s) => selected.has(s.name));

  return (
    <section className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-800"
        role="img"
        aria-label="Poengutvikling over tid"
      >
        {/* Baselinje + maks-linje (diskré) */}
        <line x1={PAD.left} y1={baseline} x2={W - PAD.right} y2={baseline} stroke="#475569" strokeWidth="0.5" />
        <line x1={PAD.left} y1={y(maxTotal)} x2={W - PAD.right} y2={y(maxTotal)} stroke="#334155" strokeWidth="0.5" />
        <text x={PAD.left} y={y(maxTotal) - 2} fill="#64748b" fontSize="8">
          {maxTotal}p
        </text>

        {/* Linjer for valgte deltakere */}
        {shown.map((s) => {
          const color = colorOf.get(s.name)!;
          const pts = s.totals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          return (
            <g key={s.name}>
              {days.length > 1 && (
                <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
              )}
              <circle cx={x(days.length - 1)} cy={y(s.final)} r="2.4" fill={color} />
            </g>
          );
        })}

        {/* X-akse: første og siste dato */}
        <text x={PAD.left} y={H - 4} fill="#64748b" fontSize="8">
          {fmtDay(days[0])}
        </text>
        <text x={W - PAD.right} y={H - 4} fill="#64748b" fontSize="8" textAnchor="end">
          {fmtDay(days[days.length - 1])}
        </text>
      </svg>

      {/* Spiller-velger: default topp 3, trykk for å vise/skjule. Sortert på sluttsum. */}
      <div className="flex flex-wrap gap-1.5">
        {series.map((s) => {
          const active = selected.has(s.name);
          const color = colorOf.get(s.name)!;
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => toggle(s.name)}
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition ${
                active
                  ? 'border-slate-500 bg-slate-700/60 text-slate-100'
                  : 'border-slate-700/60 bg-slate-800/40 text-slate-500'
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: active ? color : '#475569' }}
              />
              <span className="truncate">{s.name}</span>
              <span className="tabular-nums opacity-70">{s.final}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
