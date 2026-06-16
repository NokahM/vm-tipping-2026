import { useMemo, useState } from 'react';
import type { BonusQuestion, Participant, ParticipantScore } from '../types';
import { parseStage } from '../utils/scoring';
import { STAGE_LABELS } from '../utils/labels';
import { TEAM_NAME_MAP } from '../utils/teamNames';
import { wcFrameStyle } from '../utils/wcFrame';

// «Hvem/hva»-spørsmål der det er gøy å se hva folket tror.
const FAVORITT_IDS = ['q1', 'q2', 'q3', 'q10', 'q12', 'q13', 'q14', 'q17'];
const PLAYER_QS = new Set(['q2', 'q3', 'q13']); // svar = spiller → bruk etternavn
const TEAM_QS = new Set(['q1', 'q10', 'q12', 'q14']); // svar = lag → kanonisk norsk staving

const stripDia = (s: string) => [...s.normalize('NFD')].filter((c) => { const x = c.charCodeAt(0); return x < 0x0300 || x > 0x036f; }).join('');
const keyOf = (s: string) => stripDia(s).toLowerCase().trim();
const lastName = (s: string) => {
  const parts = s.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : s;
};
// Kanoniske norske lagnavn nøklet diakritisk-/store-bokstav-uavhengig (Curacao → Curaçao).
const TEAM_CANON = new Map<string, string>();
for (const no of new Set(Object.values(TEAM_NAME_MAP))) TEAM_CANON.set(keyOf(no), no);

/** Slår sammen stavevarianter o.l. til ett kanonisk svar per spørsmål. */
function canonicalize(qid: string, answer: string): string {
  const a = answer.trim();
  if (!a) return a;
  if (PLAYER_QS.has(qid)) return lastName(a); // «Lionel Messi» → «Messi»
  if (TEAM_QS.has(qid)) return TEAM_CANON.get(keyOf(a)) ?? a; // «Curacao» → «Curaçao»
  if (qid === 'q17') {
    const st = parseStage(a);
    return st ? STAGE_LABELS[st] : a;
  }
  return a;
}

/** Teller opp deltakernes svar (kanonisert) → hvem som svarte hva, sortert på flest. */
function tally(participants: Participant[], qid: string): { answer: string; names: string[] }[] {
  const m = new Map<string, string[]>();
  const push = (answer: string, name: string) => {
    const arr = m.get(answer) ?? [];
    arr.push(name);
    m.set(answer, arr);
  };
  for (const p of participants) {
    const tip = p.bonusTips.find((t) => t.questionId === qid);
    const raw = tip ? (Array.isArray(tip.answer) ? tip.answer : [tip.answer]) : [];
    const cleaned = raw.map((a) => (a ?? '').trim()).filter(Boolean);
    if (cleaned.length === 0) {
      // q17: blankt = «kommer ikke ut av gruppespillet».
      if (qid === 'q17') push('Gruppespill', p.name);
      continue;
    }
    for (const a of cleaned) push(canonicalize(qid, a), p.name);
  }
  return [...m]
    .map(([answer, names]) => ({ answer, names }))
    .sort((a, b) => b.names.length - a.names.length || a.answer.localeCompare(b.answer));
}

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

/** Ett spørsmåls topp-svar med søyler (folkets favoritt). Trykk på en rad → hvem som svarte. */
function FavorittBlock({ q, participants }: { q: BonusQuestion; participants: Participant[] }) {
  const tallied = useMemo(() => tally(participants, q.id), [participants, q.id]);
  const [open, setOpen] = useState<string | null>(null);
  if (tallied.length === 0) return null;
  const shown = tallied.slice(0, 6);
  const max = shown[0].names.length;
  return (
    <div className="px-3 py-2">
      <p className="mb-1 text-xs text-slate-300">{q.question}</p>
      <ul className="space-y-1">
        {shown.map((t) => (
          <li key={t.answer}>
            <button
              type="button"
              onClick={() => setOpen((o) => (o === t.answer ? null : t.answer))}
              className="flex w-full items-center gap-2 text-[11px] active:opacity-70"
              aria-expanded={open === t.answer}
            >
              <span className="w-20 shrink-0 truncate text-left text-slate-200">{t.answer}</span>
              <div className="flex h-2.5 flex-1 overflow-hidden rounded bg-slate-900/70">
                <div className="bg-wc-red" style={{ width: `${(t.names.length / max) * 100}%` }} />
              </div>
              <span className="w-5 shrink-0 text-right tabular-nums text-slate-400">
                {t.names.length}
              </span>
            </button>
            {open === t.answer && (
              <p className="px-1 pb-1 pt-0.5 text-[10px] leading-snug text-slate-400">
                {t.names.join(', ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Deltager-stats: treffsikkerhet + poeng-kilde + folkets favoritt. */
export default function ParticipantStats({
  standings,
  participants,
  questions,
}: {
  standings: ParticipantScore[];
  participants: Participant[];
  questions: BonusQuestion[];
}) {
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

      <Card title="Folkets favoritt">
        <div className="divide-y divide-slate-700/40">
          {FAVORITT_IDS.map((id) => {
            const q = questions.find((x) => x.id === id);
            return q ? <FavorittBlock key={id} q={q} participants={participants} /> : null;
          })}
        </div>
      </Card>
    </div>
  );
}
