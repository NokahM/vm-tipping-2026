import { useMemo, useState } from 'react';
import type { Progression } from '../utils/progression';

interface Props {
  progression: Progression;
}

type Mode = 'poeng' | 'plassering';

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
  return Math.max(1, step * pow);
}

/** Sparsomme rang-merker (1 … N), maks ~6. */
function rankTicks(n: number): number[] {
  if (n <= 1) return [1];
  const count = Math.min(n, 6);
  return [...new Set(Array.from({ length: count }, (_, k) => Math.round(1 + (k * (n - 1)) / (count - 1))))];
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-0.5 text-xs font-semibold transition ${
        active
          ? 'border-slate-500 bg-slate-700/60 text-slate-100'
          : 'border-slate-700/60 bg-slate-800/40 text-slate-400'
      }`}
    >
      {children}
    </button>
  );
}

export default function ProgressionChart({ progression }: Props) {
  const { days, series } = progression;
  const [mode, setMode] = useState<Mode>('poeng');

  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    series.forEach((s, i) => m.set(s.name, LINE_COLORS[i % LINE_COLORS.length]));
    return m;
  }, [series]);

  // Rang per dag (1, 2, 2, 4 …) – regnet på hele feltet, ikke bare de valgte.
  const ranks = useMemo(() => {
    const n = days.length;
    const r = new Map<string, number[]>();
    for (const s of series) r.set(s.name, new Array(n).fill(1));
    for (let i = 0; i < n; i++) {
      const sorted = [...series].sort((a, b) => (b.totals[i] ?? 0) - (a.totals[i] ?? 0));
      let rank = 0;
      let prev: number | null = null;
      let count = 0;
      for (const s of sorted) {
        count++;
        const v = s.totals[i] ?? 0;
        if (prev === null || v !== prev) {
          rank = count;
          prev = v;
        }
        r.get(s.name)![i] = rank;
      }
    }
    return r;
  }, [series, days]);

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
  const N = series.length;

  // Poeng-akse: pent steg over lederscoren (aldri stang i taket).
  const maxTotal = Math.max(1, ...series.map((s) => s.final));
  const step = niceStep(maxTotal);
  const yMax = (Math.floor(maxTotal / step) + 1) * step;

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
    const PAD = { left: 18, right: 56, top: 10, bottom: 20 };
    const plotW = vbW - PAD.left - PAD.right;
    const plotH = vbH - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (days.length > 1 ? i / (days.length - 1) : 0.5) * plotW;

    const valAt = (s: (typeof series)[number], i: number) =>
      mode === 'poeng' ? s.totals[i] : ranks.get(s.name)![i];
    // Poeng: høyere = høyere. Plassering: rang 1 øverst, N nederst.
    const yOf = (v: number) =>
      mode === 'poeng'
        ? PAD.top + (1 - v / yMax) * plotH
        : PAD.top + ((v - 1) / Math.max(1, N - 1)) * plotH;
    const yTicks = mode === 'poeng' ? [] : rankTicks(N);
    if (mode === 'poeng') for (let v = 0; v <= yMax; v += step) yTicks.push(v);

    // Sluttpunkt-etiketter: vinkelen klemmes mildt (følger streken, men aldri bratt), og
    // anti-overlappen tar høyde for at rotert tekst tar mer vertikal plass enn fonthøyden.
    const MAX_ANGLE = 12; // grader – flatere = mindre vertikalt fotavtrykk = tettere navn
    const FONT_H = 7;
    const clampAngle = (a: number) => Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, a));
    const sinDeg = (d: number) => Math.sin((d * Math.PI) / 180);
    // «Har vært der lengst»: ved lik sluttverdi sammenlignes bakover dag for dag – den som lå
    // høyere PÅ SKJERMEN ved første dagen de skilte lag, er den etablerte (beholder navnet på
    // linja). Vi bruker `yOf` (ikke rå verdi) så det blir riktig i begge moduser: i Poeng er
    // høy verdi øverst, i Plassering er lav verdi (1. plass) øverst – `yOf` koder begge.
    // Dekker både «ligget på verdien lengst» og «vært foran lengst» (den andre tok den nettopp
    // igjen). Negativ = `a` er mest etablert → sorteres først.
    const seniorCmp = (a: (typeof series)[number], b: (typeof series)[number]) => {
      for (let i = a.totals.length - 1; i >= 0; i--) {
        const ya = yOf(valAt(a, i));
        const yb = yOf(valAt(b, i));
        if (ya !== yb) return ya - yb; // høyere på skjermen (mindre y) = mer etablert = først
      }
      return a.name.localeCompare(b.name, 'no');
    };
    const ends = shown.map((s) => {
      const n = s.totals.length;
      const lastV = valAt(s, n - 1);
      const prevV = n >= 2 ? valAt(s, n - 2) : lastV;
      const ly = yOf(lastV);
      const rawAngle =
        n >= 2 ? (Math.atan2(yOf(lastV) - yOf(prevV), x(n - 1) - x(n - 2)) * 180) / Math.PI : 0;
      const angle = clampAngle(rawAngle);
      const labelW = shortLabel(s.name).length * 3.8; // grov tekstbredde ved fontSize 7
      const half = (FONT_H + labelW * Math.abs(sinDeg(angle))) / 2; // kun til kant-klamp
      return { s, n, color: colorOf.get(s.name)!, lx: x(n - 1), ly, angle, renderAngle: angle, labelW, half, labelY: ly, moved: 0, dx: 0 };
    });
    // Vertikal anti-overlapp, men kun så streng som geometrien krever: ekstra avstand trengs
    // BARE når den øvre etikettens hale dykker ned mot den nedre (vinklene konvergerer). To
    // parallelle naboer (samme vinkel) – eller divergerende – trenger kun fonthøyden, uansett
    // hvor bratte de er. `w·max(0, sinØvre − sinNedre)` er nettopp den nedstigningen.
    // Ved lik høyde (samme verdi/linje) får den mest etablerte (seniorCmp) beholde plassen sin
    // på linja; den andre presses nedover. Den øverste i hver kollisjon står alltid urørt.
    const SEP = 1;
    const sorted = [...ends].sort((a, b) => a.ly - b.ly || seniorCmp(a.s, b.s));
    let prev: (typeof sorted)[number] | null = null;
    for (const e of sorted) {
      if (prev) {
        // Geometrisk klaring mot naboen over (naboens vinkel mot egen).
        const w = Math.min(prev.labelW, e.labelW);
        const extra = w * Math.max(0, sinDeg(prev.renderAngle) - sinDeg(e.angle));
        const minY = prev.labelY + FONT_H + extra + SEP;
        if (e.ly >= minY) {
          e.labelY = e.ly; // får plass på egen linje → behold egen vinkel
        } else {
          // Forskjøvet og «frakoblet» egen linje → arv vinkelen til navnet over (da blir de
          // parallelle og trenger bare fonthøyden) og legg deg rett under det.
          e.renderAngle = prev.renderAngle;
          e.labelY = prev.labelY + FONT_H + SEP;
        }
      }
      prev = e;
    }
    // Hvor langt hvert navn ble dyttet av STABLINGEN (før kant-klamp) – styrer hjelpestrek/nudge,
    // så en global kant-justering aldri gir senioren (urørt av stablingen) en strek.
    for (const e of ends) e.moved = e.labelY - e.ly;
    // Kant-klamp så ingenting klippes (skyv hele stabelen som blokk). Liten toppmargin, så et navn
    // på topp (f.eks. 1. plass i kanten) ikke dyttes vekk fra punktet sitt.
    if (sorted.length) {
      const lastE = sorted[sorted.length - 1];
      const overBottom = lastE.labelY + lastE.half - (vbH - PAD.bottom - 2);
      if (overBottom > 0) for (const e of ends) e.labelY -= overBottom;
      const firstE = sorted[0];
      const overTop = 2 + firstE.half - firstE.labelY;
      if (overTop > 0) for (const e of ends) e.labelY += overTop;
    }
    // Frakoblede navn (forskjøvet av stablingen) nudges litt mot høyre; navn på egen linje urørt.
    for (const e of ends) e.dx = e.moved > 0 ? Math.min(9, e.moved * 0.5) : 0;

    return (
      <svg viewBox={`0 0 ${vbW} ${vbH}`} className="w-full" role="img" aria-label="Poengutvikling over tid">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} y1={yOf(v)} x2={vbW - PAD.right} y2={yOf(v)} stroke="#334155" strokeWidth="0.4" />
            <text x={PAD.left - 2} y={yOf(v) + 2.4} fill="#64748b" fontSize="6.5" textAnchor="end">
              {v}
            </text>
          </g>
        ))}

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

        {ends.map((e) => {
          const pts = e.s.totals.map((_, i) => `${x(i)},${yOf(valAt(e.s, i))}`).join(' ');
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
              {e.moved > 4 && (
                <line
                  x1={e.lx}
                  y1={e.ly}
                  x2={e.lx + 2 + e.dx}
                  y2={e.labelY}
                  stroke={e.color}
                  strokeWidth="0.5"
                  opacity="0.5"
                />
              )}
              <text
                x={e.lx + 3 + e.dx}
                y={e.labelY + 2.2}
                fill={e.color}
                fontSize="7"
                fontWeight="600"
                transform={`rotate(${e.renderAngle} ${e.lx + e.dx} ${e.labelY})`}
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
      <div className="flex justify-center gap-1.5">
        <ModeBtn active={mode === 'poeng'} onClick={() => setMode('poeng')}>
          Poeng
        </ModeBtn>
        <ModeBtn active={mode === 'plassering'} onClick={() => setMode('plassering')}>
          Plassering
        </ModeBtn>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
        {renderSvg(340, 240)}
      </div>
      <p className="px-1 text-center text-[11px] text-slate-500">
        Trykk på en spiller for å vise/skjule linja (standard: topp 3)
      </p>
      {legend}
    </section>
  );
}
