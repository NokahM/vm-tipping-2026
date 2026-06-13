import { useState } from 'react';
import type { BonusQuestion, BonusTip, Participant } from '../types';
import { scoreBonusQuestion } from '../utils/scoring';

interface Props {
  questions: BonusQuestion[];
  participants: Participant[];
}

function answerText(tip: BonusTip | undefined): string | null {
  if (!tip) return null;
  return Array.isArray(tip.answer) ? tip.answer.join(' + ') : tip.answer;
}

function chipClasses(hasFasit: boolean, hasAnswer: boolean, points: number, max: number): string {
  if (!hasAnswer) return 'border-slate-700/40 bg-slate-800/40 text-slate-500';
  if (!hasFasit) return 'border-slate-600/40 bg-slate-700/30 text-slate-300';
  if (points >= max) return 'border-wc-lime/40 bg-wc-lime/15 text-wc-lime';
  if (points > 0) return 'border-wc-yellow/40 bg-wc-yellow/15 text-wc-yellow';
  return 'border-wc-red/40 bg-wc-red/15 text-wc-red';
}

export default function BonusQuestions({ questions, participants }: Props) {
  return (
    <ul className="divide-y divide-slate-700/70 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
      {questions.map((q) => (
        <BonusRow key={q.id} question={q} participants={participants} />
      ))}
    </ul>
  );
}

function BonusRow({ question, participants }: { question: BonusQuestion; participants: Participant[] }) {
  const [open, setOpen] = useState(false);
  const hasFasit = question.answer !== null;
  const points = scoreBonusQuestion(participants, question);
  const fasit = Array.isArray(question.answer) ? question.answer.join(', ') : question.answer;

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
            <p className="mt-0.5 text-xs text-wc-lime">Fasit: {fasit}</p>
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
