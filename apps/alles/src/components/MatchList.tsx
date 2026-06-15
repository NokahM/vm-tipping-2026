import { useMemo, useState } from 'react';
import type { MatchResult, Participant } from '../types';
import { STAGE_LABELS, STAGE_ORDER, groupLabel } from '../utils/labels';
import { wcFrameStyle } from '../utils/wcFrame';
import MatchRow from './MatchRow';
import FeaturedMatch from './FeaturedMatch';

interface Props {
  results: MatchResult[];
  participants: Participant[];
}

function byDate(a: MatchResult, b: MatchResult): number {
  return a.utcDate.localeCompare(b.utcDate);
}

const FEATURED_LIMIT = 2;

/**
 * Velger «aktuelle kamper» (inntil to), i prioritert rekkefølge: pågående nå
 * først, fyll resten med neste kommende, ellers sist spilte.
 */
function pickFeatured(known: MatchResult[]): MatchResult[] {
  const now = Date.now();
  // En kamp varer ~2t; gi rom for pause/tillegg før vi slutter å regne den som «pågående».
  const LIVE_WINDOW = 3.5 * 60 * 60 * 1000;

  // «Pågår nå»: eksplisitt live-status, ELLER avspark har vært men kampen er ikke ferdig
  // (football-data.org henger ofte noen minutter etter med å flippe status til IN_PLAY,
  // og da skal kampen IKKE forsvinne fra Aktuelt idet klokken passerer avspark).
  const liveish = known
    .filter((m) => {
      if (m.status === 'IN_PLAY' || m.status === 'PAUSED') return true;
      if (m.status === 'FINISHED') return false;
      const kickoff = new Date(m.utcDate).getTime();
      return kickoff <= now && now - kickoff < LIVE_WINDOW;
    })
    .sort(byDate);

  const upcoming = known
    .filter((m) => m.status !== 'FINISHED' && new Date(m.utcDate).getTime() > now)
    .sort(byDate);

  const finished = known
    .filter((m) => m.status === 'FINISHED')
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate));

  const ordered: MatchResult[] = [];
  const seen = new Set<number>();
  for (const m of [...liveish, ...upcoming, ...finished]) {
    if (seen.has(m.apiId)) continue;
    seen.add(m.apiId);
    ordered.push(m);
    if (ordered.length >= FEATURED_LIMIT) break;
  }
  return ordered;
}

// Gruppe A–L får hver sin offisielle farge. Rekkefølge stokket så like farger
// aldri ligger ved siden av (eller nær) hverandre.
const GROUP_COLORS = [
  'text-wc-red', // A
  'text-wc-mint', // B
  'text-wc-yellow', // C
  'text-wc-blue', // D
  'text-wc-orange', // E
  'text-wc-lime', // F
  'text-wc-lavender', // G
  'text-wc-red', // H
  'text-wc-mint', // I
  'text-wc-yellow', // J
  'text-wc-blue', // K
  'text-wc-lime', // L
];

function groupColor(group: string): string {
  const i = group.charCodeAt(group.length - 1) - 65; // 'A' = 65
  return GROUP_COLORS[i] ?? 'text-wc-lime';
}

// Sluttspill-runder får hver sin farge – samme stil som gruppe-overskriftene.
const STAGE_COLORS: Record<string, string> = {
  ROUND_OF_32: 'text-wc-red',
  ROUND_OF_16: 'text-wc-blue',
  QUARTER_FINALS: 'text-wc-yellow',
  SEMI_FINALS: 'text-wc-mint',
  THIRD_PLACE: 'text-wc-lavender',
  FINAL: 'text-wc-lime',
};

const KNOCKOUT_STAGES = STAGE_ORDER.filter((s) => s !== 'GROUP_STAGE');

/** Kamper med ukjente lag (TBD) skjules til oppsettet er klart. */
function isKnown(m: MatchResult): boolean {
  return m.homeTeam !== 'TBD' && m.awayTeam !== 'TBD';
}

type Phase = 'gruppespill' | 'sluttspill';

export default function MatchList({ results, participants }: Props) {
  const known = results.filter(isKnown);
  const featured = pickFeatured(known);

  // «Siste»: de to sist ferdigspilte kampene, men ikke de som alt vises i «Aktuelt».
  const featuredIds = new Set(featured.map((m) => m.apiId));
  const recent = known
    .filter((m) => m.status === 'FINISHED' && !featuredIds.has(m.apiId))
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
    .slice(0, 2);

  // Fase-velger: følger den aktuelle kampens fase som standard, men låses til
  // brukerens valg så snart han trykker på en knapp.
  const [override, setOverride] = useState<Phase | null>(null);

  const groupMatches = known.filter((m) => m.stage === 'GROUP_STAGE').sort(byDate);
  // Sluttspill viser ALLE kampene (også TBD vs TBD med klokkeslett) – lag og stilling
  // fylles automatisk inn når API-et mater inn data per runde.
  const knockoutStages = KNOCKOUT_STAGES.map((stage) => ({
    stage,
    matches: results.filter((m) => m.stage === stage).sort(byDate),
  })).filter((s) => s.matches.length > 0);

  // Default-fase: gruppespill mens det pågår, men sluttspill så snart hele gruppespillet
  // er ferdigspilt (eller en sluttspillkamp er aktuell). Brukervalg overstyrer.
  const groupStageDone =
    groupMatches.length > 0 && groupMatches.every((m) => m.status === 'FINISHED');
  const featuredKnockout = featured[0] !== undefined && featured[0].stage !== 'GROUP_STAGE';
  const defaultPhase: Phase = groupStageDone || featuredKnockout ? 'sluttspill' : 'gruppespill';
  const phase = override ?? defaultPhase;

  if (groupMatches.length === 0 && knockoutStages.length === 0 && featured.length === 0) {
    return <p className="px-1 text-sm text-slate-400">Ingen kamper å vise ennå.</p>;
  }

  return (
    <div className="space-y-5">
      {/* Aktuelt + Siste – fremhevet øverst i rød-kantede bokser, samme kort-format.
          Tettere spacing mellom de to seksjonene enn mot resten. */}
      <div className="space-y-2">
        <FeaturedSection title="Aktuelt" matches={featured} participants={participants} />
        <FeaturedSection title="Siste" matches={recent} participants={participants} />
      </div>

      {/* Fase-velger: gruppespill ↔ sluttspill */}
      <div className="flex gap-1.5">
        <PhaseBtn active={phase === 'gruppespill'} onClick={() => setOverride('gruppespill')}>
          Gruppespill
        </PhaseBtn>
        <PhaseBtn active={phase === 'sluttspill'} onClick={() => setOverride('sluttspill')}>
          Sluttspill
        </PhaseBtn>
      </div>

      {phase === 'gruppespill' ? (
        <GroupStage matches={groupMatches} participants={participants} />
      ) : knockoutStages.length === 0 ? (
        <p className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-400">
          Sluttspillet er ikke trukket ennå – kampene dukker opp her automatisk når lagene er klare.
        </p>
      ) : (
        <div className="space-y-4">
          {knockoutStages.map(({ stage, matches }) => (
            <div key={stage}>
              <h3
                className={`mb-1.5 px-1 text-center text-sm font-semibold uppercase tracking-wide ${
                  STAGE_COLORS[stage] ?? 'text-wc-lime'
                }`}
              >
                {STAGE_LABELS[stage]}
              </h3>
              <MatchCard matches={matches} participants={participants} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fremhevet seksjon (Aktuelt / Siste): rød-kantet boks med inntil to FeaturedMatch-kort. */
function FeaturedSection({
  title,
  matches,
  participants,
}: {
  title: string;
  matches: MatchResult[];
  participants: Participant[];
}) {
  if (matches.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-center text-sm font-semibold uppercase tracking-wide text-white">
        {title}
      </h2>
      <div className="divide-y divide-slate-700/70 overflow-hidden rounded-xl border border-wc-red/50 bg-slate-800 ring-1 ring-wc-red/20">
        {matches.map((m) => (
          <FeaturedMatch key={m.apiId} match={m} participants={participants} />
        ))}
      </div>
    </section>
  );
}

function GroupStage({ matches, participants }: { matches: MatchResult[]; participants: Participant[] }) {
  const groups = [...new Set(matches.map((m) => m.group).filter(Boolean))] as string[];
  groups.sort();

  // Samme stil som sluttspillet: hver gruppe er sitt eget rød-kantede kort med farget
  // overskrift over, adskilt med luft.
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g}>
          <h3
            className={`mb-1.5 px-1 text-center text-sm font-semibold uppercase tracking-wide ${groupColor(g)}`}
          >
            {groupLabel(g)}
          </h3>
          <MatchCard matches={matches.filter((m) => m.group === g)} participants={participants} />
        </div>
      ))}
    </div>
  );
}

function MatchCard({ matches, participants }: { matches: MatchResult[]; participants: Participant[] }) {
  const frameStyle = useMemo(wcFrameStyle, []);
  return (
    <ul
      style={frameStyle}
      className="wc-frame divide-y divide-slate-700/70 overflow-hidden rounded-xl bg-slate-800"
    >
      {matches.map((m) => (
        <MatchRow key={m.apiId} match={m} participants={participants} />
      ))}
    </ul>
  );
}

function PhaseBtn({
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
      className={`min-h-[28px] flex-1 rounded-lg px-3 text-sm font-semibold transition ${
        active
          ? 'wc-btn text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]'
          : 'bg-slate-800 text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
