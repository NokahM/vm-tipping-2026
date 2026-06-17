import { useMemo, useState } from 'react';
import type { MatchResult } from '../types';
import { normalizeTeamName } from '../utils/teamNames';
import { wcFrameStyle } from '../utils/wcFrame';

const MIN_LABELS = ['1-15', '16-30', '31-45', '46-60', '61-75', '76-90', '90+'];

// «Kampdag» i amerikansk tid. Bruker Pacific (vestligste vertssone) så ingen kamp krysser
// midnatt: alle kampkvelder ligger før midnatt i PT, og østligere kamper havner uansett på
// samme PT-dato. Grupperer dermed etter kalenderdagen kampene faktisk spilles. en-CA = YYYY-MM-DD.
const usDay = (utcDate: string) =>
  new Date(utcDate).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

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

/** Kompakt vertikalt søylediagram for mål per kampdag (sparsomme dato-merker). */
function DayBars({ data, max }: { data: [string, number][]; max: number }) {
  const W = 340;
  const H = 110;
  const PAD = { top: 12, bottom: 16 };
  const plotH = H - PAD.top - PAD.bottom;
  const n = data.length;
  const bw = W / n;
  const barW = Math.max(1.2, bw * 0.7);
  const step = Math.max(1, Math.round((n - 1) / 5));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Mål per kampdag">
      {data.map(([day, g], i) => {
        const h = (g / max) * plotH;
        const x = i * bw + (bw - barW) / 2;
        const show = i === 0 || i === n - 1 || i % step === 0;
        return (
          <g key={day}>
            <rect x={x} y={PAD.top + plotH - h} width={barW} height={h} fill="#afe905" rx="0.6" />
            <text
              x={i * bw + bw / 2}
              y={PAD.top + plotH - h - 2}
              fill="#cbd5e1"
              fontSize="7.5"
              fontWeight="600"
              textAnchor="middle"
            >
              {g}
            </text>
            {show && (
              <text x={i * bw + bw / 2} y={H - 4} fill="#64748b" fontSize="6.5" textAnchor="middle">
                {day.slice(8, 10)}.{day.slice(5, 7)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** «Nerding»: ren fotball-statistikk – mål-fordeling per minutt + mål per kampdag. */
export default function FootballStats({
  goalMinutes,
  results,
}: {
  goalMinutes?: number[];
  results: MatchResult[];
}) {
  const mins = goalMinutes ?? [];
  const totalGoals = mins.reduce((a, b) => a + b, 0);
  const maxMin = Math.max(1, ...mins);
  const [openResult, setOpenResult] = useState<string | null>(null);

  const goalsByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of results) {
      if (r.status !== 'FINISHED' || r.homeGoals == null || r.awayGoals == null) continue;
      const day = usDay(r.utcDate);
      m.set(day, (m.get(day) ?? 0) + r.homeGoals + r.awayGoals);
    }
    return [...m].sort((a, b) => a[0].localeCompare(b[0])) as [string, number][];
  }, [results]);
  const maxDay = Math.max(1, ...goalsByDay.map(([, g]) => g));

  // Vanligste faktiske resultater (ferdigspilte kamper); speilvendte slås sammen (2–1 = 1–2).
  // Per resultat lagres også kampene (for klikk → hvilke kamper), sortert kronologisk.
  const commonResults = useMemo(() => {
    const m = new Map<string, MatchResult[]>();
    for (const r of results) {
      if (r.status !== 'FINISHED' || r.homeGoals == null || r.awayGoals == null) continue;
      const hi = Math.max(r.homeGoals, r.awayGoals);
      const lo = Math.min(r.homeGoals, r.awayGoals);
      const key = `${hi}–${lo}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    for (const list of m.values()) list.sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    return [...m].sort((a, b) => b[1].length - a[1].length);
  }, [results]);
  const maxResult = Math.max(1, ...commonResults.map(([, list]) => list.length));

  return (
    <div className="space-y-3">
      <Card title="Vanligste resultater">
        {commonResults.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Ingen ferdigspilte kamper ennå.</p>
        ) : (
          <ul className="space-y-1 px-3 py-2">
            {commonResults.map(([score, list]) => (
              <li key={score}>
                <button
                  type="button"
                  onClick={() => setOpenResult((v) => (v === score ? null : score))}
                  className="flex w-full items-center gap-2 text-left text-[11px] active:opacity-70"
                  aria-expanded={openResult === score}
                >
                  <span className="w-9 shrink-0 tabular-nums text-slate-300">{score}</span>
                  <div className="flex h-3 flex-1 overflow-hidden rounded bg-slate-900/70">
                    <div className="bg-wc-lime" style={{ width: `${(list.length / maxResult) * 100}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right tabular-nums text-slate-400">
                    {list.length}
                  </span>
                </button>
                {openResult === score && (
                  <ul className="mb-1 mt-1 space-y-0.5 pl-1">
                    {list.map((m) => (
                      <li
                        key={m.apiId}
                        className="flex items-center gap-1.5 text-[10px] text-slate-400"
                      >
                        <span className="min-w-0 flex-1 truncate text-right">
                          {normalizeTeamName(m.homeTeam)}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-200">
                          {m.homeGoals}–{m.awayGoals}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{normalizeTeamName(m.awayTeam)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Mål-fordeling (minutt)">
        {totalGoals === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Ingen mål registrert ennå.</p>
        ) : (
          <ul className="space-y-1 px-3 py-2">
            {mins.map((v, i) => (
              <li key={MIN_LABELS[i]} className="flex items-center gap-2 text-[11px]">
                <span className="w-12 shrink-0 tabular-nums text-slate-400">{MIN_LABELS[i]}</span>
                <div className="flex h-3 flex-1 overflow-hidden rounded bg-slate-900/70">
                  <div className="bg-wc-lime" style={{ width: `${(v / maxMin) * 100}%` }} />
                </div>
                <span className="w-6 shrink-0 text-right tabular-nums text-slate-300">{v}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Mål per kampdag">
        {goalsByDay.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Ingen ferdigspilte kamper ennå.</p>
        ) : (
          <div className="px-3 pb-2 pt-3">
            <DayBars data={goalsByDay} max={maxDay} />
            <p className="mt-1 text-center text-[10px] text-slate-600">
              Kampdag i amerikansk tid (Pacific) – der kampene spilles
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
