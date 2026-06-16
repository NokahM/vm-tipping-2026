import { useMemo, useState } from 'react';
import type { BonusQuestion, BonusTip, MatchResult, Participant } from '../types';
import {
  groupGoalLeaders,
  projectTotalGoals,
  scoreBonusQuestion,
  type GoalProjection,
  type GroupGoalStanding,
} from '../utils/scoring';
import { worstTeamSoFar, type GroupRow } from '../utils/groupTables';
import { normalizeTeamName } from '../utils/teamNames';
import { wcFrameStyle } from '../utils/wcFrame';

interface FastestGoal {
  minute: number;
  scorer: string;
  team: string;
}

interface Props {
  questions: BonusQuestion[];
  participants: Participant[];
  results: MatchResult[];
  fastestGoal?: FastestGoal | null;
  preliminary?: Record<string, string>; // foreløpige «slik ligger det an»-verdier per spørsmål
}

const GOAL_QUESTION_ID = 'q5'; // hvor mange mål totalt – ±5 av projeksjonen = full pott
const GOAL_MARGIN = 5;
const GROUP_GOALS_QUESTION_ID = 'q9'; // hvilken gruppe scorer flest mål – leder-gruppen
const WORST_TEAM_QUESTION_ID = 'q10'; // VMs dårligste lag – dårligst-så-langt
const FASTEST_GOAL_QUESTION_ID = 'q6'; // raskeste mål – pekepinn (eksakt tid settes manuelt)

/** «Julián Quiñones» → «Quiñones» for kompakt visning. */
function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : full;
}

/**
 * Tallinje for q5 (antall mål totalt): alle deltakernes gjett som prikker, projeksjonen
 * markert med ±-bånd. Grønn prikk = innenfor ±margin (full pott), rød = utenfor.
 */
function Q5NumberLine({
  guesses,
  projected,
  margin,
}: {
  guesses: { name: string; value: number }[];
  projected: number | null;
  margin: number;
}) {
  if (guesses.length === 0) return null;
  const W = 340;
  const PAD = 8;
  const plotW = W - 2 * PAD;
  const values = guesses.map((g) => g.value);
  const all = projected != null ? [...values, projected] : values;
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= margin;
    max += margin;
  }
  const span = (max - min) * 0.08;
  min -= span;
  max += span;
  const x = (v: number) => PAD + ((v - min) / (max - min)) * plotW;

  const LABEL_Y = 8; // «~299» hviler oppå den grønne boksen
  const BOX_TOP = 10; // topp på grønn boks + gul strek (like høye)
  const AXIS_Y = 30; // x-aksen = boksens/strekens bunn
  const H = 43;
  const boxH = AXIS_Y - BOX_TOP;

  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const spacing = Math.min(4, (boxH - 4) / Math.max(1, ...counts.values()));
  const seen = new Map<number, number>();

  // Pene mellom-merker på x-aksen (naturlige intervaller mellom min og max).
  const niceTicks = (() => {
    const range = max - min;
    const rawStep = range / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / pow;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * pow;
    const ts: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) ts.push(v);
    const edge = range * 0.12;
    return ts.filter((v) => v > min + edge && v < max - edge).slice(0, 3);
  })();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mb-2 w-full" role="img" aria-label="Antall mål – alles gjett">
      {projected != null && (
        <rect
          x={x(projected - margin)}
          y={BOX_TOP}
          width={x(projected + margin) - x(projected - margin)}
          height={boxH}
          fill="#10b981"
          opacity="0.12"
        />
      )}
      <line x1={PAD} y1={AXIS_Y} x2={W - PAD} y2={AXIS_Y} stroke="#475569" strokeWidth="0.6" />
      <text x={PAD} y={H - 2} fill="#64748b" fontSize="6.5" textAnchor="start">
        {Math.ceil(min)}
      </text>
      <text x={W - PAD} y={H - 2} fill="#64748b" fontSize="6.5" textAnchor="end">
        {Math.floor(max)}
      </text>
      {niceTicks.map((v) => (
        <g key={v}>
          <line x1={x(v)} y1={AXIS_Y} x2={x(v)} y2={AXIS_Y + 2.5} stroke="#475569" strokeWidth="0.5" />
          <text x={x(v)} y={H - 2} fill="#64748b" fontSize="6.5" textAnchor="middle">
            {v}
          </text>
        </g>
      ))}
      {projected != null && (
        <>
          <line x1={x(projected)} y1={BOX_TOP} x2={x(projected)} y2={AXIS_Y} stroke="#eab308" strokeWidth="1" />
          <text x={x(projected)} y={LABEL_Y} fill="#eab308" fontSize="7" textAnchor="middle">
            ~{projected}
          </text>
        </>
      )}
      {guesses.map((g, i) => {
        const stack = seen.get(g.value) ?? 0;
        seen.set(g.value, stack + 1);
        const inBand = projected != null && Math.abs(g.value - projected) <= margin;
        return (
          <circle
            key={i}
            cx={x(g.value)}
            cy={AXIS_Y - 3 - stack * spacing}
            r="2.2"
            fill={inBand ? '#10b981' : '#f87171'}
          />
        );
      })}
    </svg>
  );
}

const NEUTRAL = 'border-slate-700/40 bg-slate-800/40 text-slate-500';
const GREEN = 'border-emerald-600/40 bg-emerald-500/15 text-emerald-300';
const AMBER = 'border-amber-600/40 bg-amber-500/15 text-amber-300';
const RED = 'border-red-700/40 bg-red-500/15 text-red-300';

function answerText(tip: BonusTip | undefined): string | null {
  if (!tip) return null;
  return Array.isArray(tip.answer) ? tip.answer.join(' + ') : tip.answer;
}

function chipClasses(hasFasit: boolean, hasAnswer: boolean, points: number, max: number): string {
  if (!hasAnswer) return NEUTRAL;
  if (!hasFasit) return 'border-slate-600/40 bg-slate-700/30 text-slate-300';
  if (points >= max) return GREEN;
  if (points > 0) return AMBER;
  return RED;
}

function parseGoals(text: string | null): number | null {
  if (text === null) return null;
  const n = parseInt(text.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/** Henter ut gruppe-bokstaver (A–L) som står alene i et q9-svar, f.eks. «I og L» → [I, L]. */
function groupLetters(text: string | null): string[] {
  if (!text) return [];
  return text.toUpperCase().match(/\b[A-L]\b/g) ?? [];
}

export default function BonusQuestions({
  questions,
  participants,
  results,
  fastestGoal,
  preliminary,
}: Props) {
  const projection = useMemo(() => projectTotalGoals(results), [results]);
  const groupLeaders = useMemo(() => groupGoalLeaders(results), [results]);
  const worst = useMemo(() => worstTeamSoFar(results), [results]);
  const frameStyle = useMemo(wcFrameStyle, []);

  return (
    <ul
      style={frameStyle}
      className="wc-frame divide-y divide-slate-700/70 overflow-hidden rounded-xl bg-slate-800"
    >
      {questions.map((q) => (
        <BonusRow
          key={q.id}
          question={q}
          participants={participants}
          projection={projection}
          groupLeaders={groupLeaders}
          worst={worst}
          fastestGoal={fastestGoal ?? null}
          preliminary={preliminary?.[q.id] ?? null}
        />
      ))}
    </ul>
  );
}

function BonusRow({
  question,
  participants,
  projection,
  groupLeaders,
  worst,
  fastestGoal,
  preliminary,
}: {
  question: BonusQuestion;
  participants: Participant[];
  projection: GoalProjection | null;
  groupLeaders: GroupGoalStanding | null;
  worst: GroupRow | null;
  fastestGoal: FastestGoal | null;
  preliminary: string | null;
}) {
  const [open, setOpen] = useState(false);
  const hasFasit = question.answer !== null;
  const points = scoreBonusQuestion(participants, question);
  const fasit = Array.isArray(question.answer) ? question.answer.join(', ') : question.answer;

  // Live-moduser, kun før fasit: q5 nærmest projeksjonen, q9 leder-gruppen, q10 dårligst så langt,
  // q6 raskeste mål så langt (pekepinn – eksakt tid settes manuelt).
  const goalProj = question.id === GOAL_QUESTION_ID && !hasFasit ? projection : null;
  const groupLead = question.id === GROUP_GOALS_QUESTION_ID && !hasFasit ? groupLeaders : null;
  const worstLead = question.id === WORST_TEAM_QUESTION_ID && !hasFasit ? worst : null;
  const worstName = worstLead ? normalizeTeamName(worstLead.team) : null;
  const fastestLead =
    question.id === FASTEST_GOAL_QUESTION_ID && !hasFasit ? fastestGoal : null;

  // q5-tallinje: alle deltakernes mål-gjett + projeksjonen (eller fasit) som markør.
  const q5Guesses =
    question.id === GOAL_QUESTION_ID
      ? participants
          .map((p) => {
            const v = parseGoals(answerText(p.bonusTips.find((t) => t.questionId === question.id)));
            return v != null ? { name: p.name, value: v } : null;
          })
          .filter((g): g is { name: string; value: number } => g != null)
      : [];
  const q5Projected = goalProj
    ? goalProj.projected
    : hasFasit
      ? parseGoals(String(question.answer))
      : null;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left active:bg-slate-700/30"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-100">{question.question}</p>
          {hasFasit ? (
            <p className="mt-0.5 text-xs text-emerald-400">Fasit: {fasit}</p>
          ) : goalProj ? (
            <p className="mt-0.5 text-xs text-wc-yellow">
              Projeksjon nå: ~{goalProj.projected} mål
              <span className="text-slate-500">
                {' '}
                · {(goalProj.goalsSoFar / goalProj.matchesCounted).toFixed(2).replace('.', ',')} pr.
                kamp · {goalProj.goalsSoFar} på {goalProj.matchesCounted} kamper · ±{GOAL_MARGIN} mål =
                full pott
              </span>
            </p>
          ) : groupLead ? (
            <p className="mt-0.5 text-xs text-wc-yellow">
              Leder nå: Gruppe {groupLead.leaders.join(', ')}
              <span className="text-slate-500"> · {groupLead.topGoals} mål</span>
            </p>
          ) : worstLead ? (
            <p className="mt-0.5 text-xs text-wc-yellow">
              Dårligst nå: {worstName}
              <span className="text-slate-500">
                {' '}
                · {worstLead.points} p · {worstLead.gd > 0 ? `+${worstLead.gd}` : worstLead.gd} mål
              </span>
            </p>
          ) : fastestLead ? (
            <p className="mt-0.5 text-xs text-wc-yellow">
              Raskeste mål så langt: {fastestLead.minute}' {lastName(fastestLead.scorer)}
              <span className="text-slate-500"> · foreløpig (eksakt tid settes manuelt)</span>
            </p>
          ) : preliminary ? (
            <p className="mt-0.5 text-xs text-wc-yellow">
              {preliminary}
              <span className="text-slate-500"> · Ikke avgjort</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">Ikke avgjort</p>
          )}
        </div>
        <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300">
          {question.maxPoints}p
        </span>
        <svg
          className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="px-3 pb-2.5">
          {question.id === GOAL_QUESTION_ID && (
            <Q5NumberLine guesses={q5Guesses} projected={q5Projected} margin={GOAL_MARGIN} />
          )}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {participants.map((p) => {
            const tip = p.bonusTips.find((t) => t.questionId === question.id);
            const text = answerText(tip);
            let cls: string;
            let suffix: string | null = null;

            if (goalProj) {
              // q5: innenfor ±5 av projeksjonen = grønn (full pott), vis avstanden.
              const guess = parseGoals(text);
              if (guess === null) {
                cls = NEUTRAL;
              } else {
                const diff = guess - goalProj.projected;
                cls = Math.abs(diff) <= GOAL_MARGIN ? GREEN : RED;
                suffix = `${diff > 0 ? '+' : ''}${diff}`;
              }
            } else if (groupLead) {
              // q9: valgt en leder-gruppe = grønn.
              const letters = groupLetters(text);
              cls =
                letters.length === 0
                  ? NEUTRAL
                  : letters.some((l) => groupLead.leaders.includes(l))
                    ? GREEN
                    : RED;
            } else if (worstLead) {
              // q10: tippet det dårligste laget så langt = grønn.
              cls =
                text === null
                  ? NEUTRAL
                  : normalizeTeamName(text) === normalizeTeamName(worstLead.team)
                    ? GREEN
                    : RED;
            } else {
              const pts = points.get(p.name) ?? 0;
              cls = chipClasses(hasFasit, text !== null, pts, question.maxPoints);
              if (hasFasit && text !== null) suffix = `${pts}p`;
            }

            return (
              <div
                key={p.name}
                className={`flex items-baseline justify-between gap-2 rounded border px-2 py-1 text-xs ${cls}`}
              >
                <span className="shrink-0 font-medium">{p.name}</span>
                <span className="truncate text-right">
                  {text ?? '–'}
                  {suffix && <span className="opacity-70"> · {suffix}</span>}
                </span>
              </div>
            );
            })}
          </div>
        </div>
      )}
    </li>
  );
}
