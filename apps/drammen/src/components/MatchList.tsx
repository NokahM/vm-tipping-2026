import type { MatchResult, Participant } from '../types';
import { STAGE_LABELS, STAGE_ORDER, groupLabel } from '../utils/labels';
import MatchRow from './MatchRow';
import FeaturedMatch from './FeaturedMatch';

interface Props {
  results: MatchResult[];
  participants: Participant[];
}

function byDate(a: MatchResult, b: MatchResult): number {
  return a.utcDate.localeCompare(b.utcDate);
}

/** Velger «aktuell kamp»: live nå, ellers neste kommende, ellers sist spilte. */
function pickFeatured(known: MatchResult[]): MatchResult | null {
  const live = known
    .filter((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED')
    .sort(byDate);
  if (live.length) return live[0];

  const now = Date.now();
  const upcoming = known
    .filter(
      (m) =>
        (m.status === 'SCHEDULED' || m.status === 'TIMED') &&
        new Date(m.utcDate).getTime() >= now,
    )
    .sort(byDate);
  if (upcoming.length) return upcoming[0];

  const finished = known
    .filter((m) => m.status === 'FINISHED')
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate));
  return finished[0] ?? null;
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

/** Kamper med ukjente lag (TBD) skjules til oppsettet er klart. */
function isKnown(m: MatchResult): boolean {
  return m.homeTeam !== 'TBD' && m.awayTeam !== 'TBD';
}

export default function MatchList({ results, participants }: Props) {
  const known = results.filter(isKnown);
  const featured = pickFeatured(known);

  const stages = STAGE_ORDER.map((stage) => ({
    stage,
    matches: known.filter((m) => m.stage === stage).sort(byDate),
  })).filter((s) => s.matches.length > 0);

  if (stages.length === 0 && !featured) {
    return <p className="px-1 text-sm text-slate-400">Ingen kamper å vise ennå.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Aktuell kamp – fremhevet øverst. Kampen vises fortsatt i sin runde under. */}
      {featured && <FeaturedMatch match={featured} participants={participants} />}

      {stages.map(({ stage, matches }) => (
        <section key={stage}>
          {/* Gruppespill trenger ingen overskrift – gruppenavnene (Gruppe A …) avslører det. */}
          {stage !== 'GROUP_STAGE' && (
            <h2 className="mb-2 px-1 text-lg font-bold text-slate-100">{STAGE_LABELS[stage]}</h2>
          )}
          {stage === 'GROUP_STAGE' ? (
            <GroupStage matches={matches} participants={participants} />
          ) : (
            <MatchCard matches={matches} participants={participants} />
          )}
        </section>
      ))}
    </div>
  );
}

function GroupStage({ matches, participants }: { matches: MatchResult[]; participants: Participant[] }) {
  const groups = [...new Set(matches.map((m) => m.group).filter(Boolean))] as string[];
  groups.sort();

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g}>
          <h3
            className={`mb-1.5 px-1 text-sm font-semibold uppercase tracking-wide ${groupColor(g)}`}
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
  return (
    <ul className="divide-y divide-slate-700/70 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
      {matches.map((m) => (
        <MatchRow key={m.apiId} match={m} participants={participants} />
      ))}
    </ul>
  );
}
