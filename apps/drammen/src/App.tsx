import { useMemo, useState } from 'react';
import { STORAGE_KEYS } from './config';
import { PARTICIPANTS } from './data/participants';
import { BONUS_QUESTIONS } from './data/bonusQuestions';
import knockoutBaked from './data/knockoutTips.json';
import bonusBaked from './data/bonusAnswers.json';
import { useMatches } from './hooks/useMatches';
import { computeStandings } from './utils/scoring';
import { formatTime } from './utils/labels';
import {
  applyBonusAnswers,
  loadBonusStore,
  loadKnockoutStore,
  mergeKnockoutTips,
  saveBonusStore,
  saveKnockoutStore,
  type BonusStore,
  type KnockoutStore,
} from './utils/storage';
import Leaderboard from './components/Leaderboard';
import MatchList from './components/MatchList';
import BonusQuestions from './components/BonusQuestions';
import AdminPanel from './components/AdminPanel';

type View = 'tabell' | 'kamper' | 'krydder';

// Innbakt (delt) admin-data fra repoet. localStorage legges oppå som live-overstyring.
const KNOCKOUT_BAKED = knockoutBaked as KnockoutStore;
const BONUS_BAKED = bonusBaked as BonusStore;

function isAdminUrl(): boolean {
  return new URLSearchParams(window.location.search).get('admin') === 'true';
}

export default function App() {
  const { results, loading, error, lastUpdated, refresh } = useMatches();
  const [view, setView] = useState<View>('tabell');
  const [adminOpen, setAdminOpen] = useState(isAdminUrl);

  const [knockoutStore, setKnockoutStore] = useState<KnockoutStore>(loadKnockoutStore);
  const [bonusStore, setBonusStore] = useState<BonusStore>(loadBonusStore);

  // Innbakt data + lokale (admin) overstyringer. localStorage vinner ved konflikt.
  const knockoutMerged = useMemo(() => ({ ...KNOCKOUT_BAKED, ...knockoutStore }), [knockoutStore]);
  const bonusMerged = useMemo(() => ({ ...BONUS_BAKED, ...bonusStore }), [bonusStore]);

  const participants = useMemo(
    () => mergeKnockoutTips(PARTICIPANTS, knockoutMerged),
    [knockoutMerged],
  );
  const questions = useMemo(
    () => applyBonusAnswers(BONUS_QUESTIONS, bonusMerged),
    [bonusMerged],
  );

  const standings = useMemo(
    () => computeStandings(participants, results, questions),
    [participants, results, questions],
  );

  if (adminOpen) {
    return (
      <AdminPanel
        results={results}
        participants={PARTICIPANTS}
        questions={BONUS_QUESTIONS}
        knockoutStore={knockoutMerged}
        bonusStore={bonusMerged}
        loading={loading}
        onSaveKnockout={(s) => {
          setKnockoutStore(s);
          saveKnockoutStore(s);
        }}
        onSaveBonus={(s) => {
          setBonusStore(s);
          saveBonusStore(s);
        }}
        onRefresh={() => void refresh()}
        onClearCache={() => localStorage.removeItem(STORAGE_KEYS.results)}
        onClose={() => {
          setAdminOpen(false);
          window.history.replaceState(null, '', window.location.pathname);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen wc-page text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-700">
        {/* Tittel-bånd: diagonale offisielle farger + mørkt slør for lesbar hvit tekst */}
        <div className="relative overflow-hidden">
          <div className="wc-stripes absolute inset-0" aria-hidden="true" />
          <div
            className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/80 to-slate-950/55"
            aria-hidden="true"
          />
          <div className="relative mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="/wc-logo.png"
                alt="FIFA VM 2026"
                className="h-11 w-auto shrink-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]"
              />
              <h1 className="min-w-0 truncate text-xl font-bold uppercase tracking-wide text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]">
                Tippekonk
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
                {loading
                  ? 'Oppdaterer …'
                  : lastUpdated
                    ? `Sist oppdatert: ${formatTime(lastUpdated)}`
                    : ''}
              </span>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/25 bg-slate-950/60 text-white transition active:scale-95 disabled:opacity-50"
                aria-label="Oppdater resultater"
              >
                <svg
                  className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h1.633a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v3.131a.75.75 0 001.5 0v-1.32l.311.311a7 7 0 0011.712-3.138.75.75 0 00-1.45-.39zm1.23-3.723a.75.75 0 00.219-.53V3.989a.75.75 0 00-1.5 0v1.32l-.311-.311a7 7 0 00-11.712 3.139.75.75 0 101.449.389 5.5 5.5 0 019.201-2.466l.312.311H12.06a.75.75 0 000 1.5h3.13a.75.75 0 00.53-.219z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Faner – ligger inni stripe-båndet, så de deler header-bakgrunnen */}
          <div className="relative mx-auto flex max-w-2xl gap-1 px-4 pb-2">
            <TabButton active={view === 'tabell'} onClick={() => setView('tabell')}>
              Tabell
            </TabButton>
            <TabButton active={view === 'kamper'} onClick={() => setView('kamper')}>
              Kamper
            </TabButton>
            <TabButton active={view === 'krydder'} onClick={() => setView('krydder')}>
              Krydder
            </TabButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        {error && (
          <p className="mb-4 rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
            {error}
          </p>
        )}

        {/* Enkel mobil-stil layout på alle skjermstørrelser: én kolonne, valgt fane. */}
        {view === 'tabell' && <Leaderboard standings={standings} />}
        {view === 'kamper' && <MatchList results={results} participants={participants} />}
        {view === 'krydder' && (
          <BonusQuestions questions={questions} participants={participants} />
        )}
      </main>

      <footer className="mx-auto max-w-2xl px-4 pb-10 pt-6 text-center">
        <button
          type="button"
          onClick={() => {
            window.history.replaceState(null, '', '?admin=true');
            setAdminOpen(true);
          }}
          className="p-2 text-slate-700 transition hover:text-slate-400"
          aria-label="Admin"
          title="Admin"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.992 6.992 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </footer>
    </div>
  );
}

function TabButton({
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
      className={`min-h-[44px] flex-1 rounded-lg px-3 text-sm font-semibold transition [text-shadow:0_1px_2px_rgb(0_0_0/0.6)] ${
        active ? 'wc-btn text-white shadow-sm' : 'bg-slate-800 text-slate-300 [text-shadow:none]'
      }`}
    >
      {children}
    </button>
  );
}
