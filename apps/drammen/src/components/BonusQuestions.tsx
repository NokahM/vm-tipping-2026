import { useMemo, useState } from 'react';
import type { BonusQuestion, BonusTip, MatchResult, Participant } from '../types';
import { projectTotalGoals, scoreBonusQuestion, type GoalProjection } from '../utils/scoring';

interface Props {
  questions: BonusQuestion[];
  participants: Participant[];
  results: MatchResult[];
}

// q5 = «hvor mange mål scores det totalt i VM?». Får live-projeksjon + ±5-fargekoding.
const GOAL_QUESTION_ID = 'q5';
const GOAL_MARGIN = 5;

function answerText(tip: BonusTip | undefined): string | null {
  if (!tip) return null;
  return Array.isArray(tip.answer) ? tip.answer.join(' + ') : tip.answer;
}

const NEUTRAL = 'border-slate-700/40 bg-slate-800/40 text-slate-500';
const GREEN = 'border-emerald-600/40 bg-emerald-500/15 text-emerald-300';
const AMBER = 'border-amber-600/40 bg-amber-500/15 text-amber-300';
const RED = 'border-red-700/40 bg-red-500/15 text-red-300';

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

export default function BonusQuestions({ questions, participants, results }: Props) {
  const projection = useMemo(() => projectTotalGoals(results), [results]);

  return (
    <ul className="divide-y divide-slate-700/70 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
      {questions.map((q) => (
        <BonusRow key={q.id} question={q} participants={participants} projection={projection} />
      ))}
    </ul>
  );
}

function BonusRow({
  question,
  participants,
  projection,
}: {
  question: BonusQuestion;
  participants: Participant[];
  projection: GoalProjection | null;
}) {
  const [open, setOpen] = useState(false);
  const hasFasit = question.answer !== null;
  const points = scoreBonusQuestion(participants, question);
  const fasit = Array.isArray(question.answer) ? question.answer.join(', ') : question.answer;

  // Live-projeksjon vises kun for mål-spørsmålet, og kun før fasit er satt.
  const goalProjection =
    question.id === GOAL_QUESTION_ID && !hasFasit && projection ? projection : null;

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
          ) : goalProjection ? (
            <p className="mt-0.5 text-xs text-wc-yellow">
              Projeksjon nå: ~{goalProjection.projected} mål
              <span className="text-slate-500">
                {' '}
                · {goalProjection.goalsSoFar} på {goalProjection.matchesCounted} kamper · ±
                {GOAL_MARGIN} mål = full pott
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">Ikke avgjort ennå</p>
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
        <div className="grid grid-cols-1 gap-1.5 px-3 pb-2.5 sm:grid-cols-2">
          {participants.map((p) => {
            const tip = p.bonusTips.find((t) => t.questionId === question.id);
            const text = answerText(tip);
            const pts = points.get(p.name) ?? 0;

            // Mål-projeksjon: fargelegg ±5 mot projeksjonen og vis avstanden (foreløpig).
            if (goalProjection) {
              const guess = parseGoals(text);
              const diff = guess === null ? null : guess - goalProjection.projected;
              const cls =
                guess === null ? NEUTRAL : Math.abs(diff as number) <= GOAL_MARGIN ? GREEN : RED;
              return (
                <div
                  key={p.name}
                  className={`flex items-baseline justify-between gap-2 rounded border px-2 py-1 text-xs ${cls}`}
                >
                  <span className="shrink-0 font-medium">{p.name}</span>
                  <span className="truncate text-right">
                    {text ?? '–'}
                    {diff !== null && (
                      <span className="opacity-70">
                        {' '}
                        · {diff > 0 ? '+' : ''}
                        {diff}
                      </span>
                    )}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={p.name}
                className={`flex items-baseline justify-between gap-2 rounded border px-2 py-1 text-xs ${chipClasses(
                  hasFasit,
                  text !== null,
                  pts,
                  question.maxPoints,
                )}`}
              >
                <span className="shrink-0 font-medium">{p.name}</span>
                <span className="truncate text-right">
                  {text ?? '–'}
                  {hasFasit && text !== null && <span className="opacity-70"> · {pts}p</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}
