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

export default function BonusQuestions({ questions, participants, results, fastestGoal }: Props) {
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
}: {
  question: BonusQuestion;
  participants: Participant[];
  projection: GoalProjection | null;
  groupLeaders: GroupGoalStanding | null;
  worst: GroupRow | null;
  fastestGoal: FastestGoal | null;
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
                · {goalProj.goalsSoFar} på {goalProj.matchesCounted} kamper · ±{GOAL_MARGIN} mål = full
                pott
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
      )}
    </li>
  );
}
