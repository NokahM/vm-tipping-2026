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

function fmtDay(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`;
}

/** Forkort lange navn ved strek-enden så de ikke klippes mot høyre kant. */
function shortLabel(name: string): string {
  return name.length > 11 ? `${name.slice(0, 10)}…` : name;
}

/** Pent y-akse-steg (1/2/5 × 10ⁿ) for ~`target` merker. */
function niceStep(max: number, target = 5): number {
  if (max <= 0) return 1;
  const raw = max / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return Math.max(1, step * pow); // minst 1 (heltall) for poeng
}

export default function ProgressionChart({ progression }: Props) {
  const { days, series } = progression;

  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    series.forEach((s, i) => m.set(s.name, LINE_COLORS[i % LINE_COLORS.length]));
    return m;
  }, [series]);

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

  const shown = series.filter((s) => selected.has(s.name));

  // Y-akse: pent steg/maks for jevne merker.
  const maxTotal = Math.max(1, ...series.map((s) => s.final));
  const step = niceStep(maxTotal);
  // Alltid ett helt steg over lederscoren, så toppstreken aldri stanger i taket.
  const yMax = (Math.floor(maxTotal / step) + 1) * step;
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += step) yTicks.push(v);

  // X-akse: opptil ~7 jevnt fordelte dato-merker.
  const xCount = Math.min(days.length, 7);
  const xTicks = [
    ...new Set(
      days.length <= 1
        ? [0]
        : Array.from({ length: xCount }, (_, k) => Math.round((k * (days.length - 1)) / (xCount - 1))),
    ),
  ];

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  function renderSvg(vbW: number, vbH: number) {
    const PAD = { left: 18, right: 52, top: 10, bottom: 20 };
    const plotW = vbW - PAD.left - PAD.right;
    const plotH = vbH - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (days.length > 1 ? i / (days.length - 1) : 0.5) * plotW;
    const y = (v: number) => PAD.top + (1 - v / yMax) * plotH;

    // Sluttpunkt-etiketter med anti-overlapp: dytt navnene fra hverandre vertikalt.
    const ends = shown.map((s) => {
      const n = s.totals.length;
      const angle =
        n >= 2
          ? (Math.atan2(y(s.totals[n - 1]) - y(s.totals[n - 2]), x(n - 1) - x(n - 2)) * 180) /
            Math.PI
          : 0;
      return { s, n, color: colorOf.get(s.name)!, lx: x(n - 1), ly: y(s.final), angle, labelY: y(s.final) };
    });
    const MIN_GAP = 8; // minste vertikale avstand mellom navn (i SVG-enheter)
    let lastY = -Infinity;
    for (const e of [...ends].sort((a, b) => a.ly - b.ly)) {
      e.labelY = Math.max(e.ly, lastY + MIN_GAP);
      lastY = e.labelY;
    }
    // Hvis nederste navn renner under bunnen, skyv hele settet opp.
    const overflow = lastY - (vbH - PAD.bottom - 2);
    if (overflow > 0) for (const e of ends) e.labelY -= overflow;

    return (
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="w-full"
        role="img"
        aria-label="Poengutvikling over tid"
      >
        {/* Y-gridlinjer + verdier */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} y1={y(v)} x2={vbW - PAD.right} y2={y(v)} stroke="#334155" strokeWidth="0.4" />
            <text x={PAD.left - 2} y={y(v) + 2.4} fill="#64748b" fontSize="6.5" textAnchor="end">
              {v}
            </text>
          </g>
        ))}

        {/* X-datoer */}
        {xTicks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={vbH - 6}
            fill="#64748b"
            fontSize="6.5"
            textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}
          >
            {fmtDay(days[i])}
          </text>
        ))}

        {/* Linjer + sluttpunkt + navn (vinklet etter streken, dyttet fra hverandre) */}
        {ends.map((e) => {
          const pts = e.s.totals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          return (
            <g key={e.s.name}>
              {e.n > 1 && (
                <polyline
                  points={pts}
                  fill="none"
                  stroke={e.color}
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              <circle cx={e.lx} cy={e.ly} r="2.2" fill={e.color} />
              <text
                x={e.lx + 3}
                y={e.labelY + 2.2}
                fill={e.color}
                fontSize="7"
                fontWeight="600"
                transform={`rotate(${e.angle} ${e.lx} ${e.labelY})`}
              >
                {shortLabel(e.s.name)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  const legend = (
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
  );

  return (
    <section className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
        {renderSvg(340, 240)}
      </div>
      {legend}
    </section>
  );
}
