import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS } from './config';
import { PARTICIPANTS } from './data/participants';
import { BONUS_QUESTIONS } from './data/bonusQuestions';
import knockoutBaked from './data/knockoutTips.json';
import bonusBaked from './data/bonusAnswers.json';
import { useMatches } from './hooks/useMatches';
import { computeStandings } from './utils/scoring';
import { computeProgression, type BonusDateInfo } from './utils/progression';
import { formatTime } from './utils/labels';
import {
  applyBonusAnswers,
  bonusDateOf,
  bonusItemDatesOf,
  loadBonusStore,
  loadKnockoutStore,
  mergeKnockoutTips,
  saveBonusStore,
  saveKnockoutStore,
  type BonusStore,
  type KnockoutStore,
} from './utils/storage';
import { fetchRemoteState, saveRemoteState } from './utils/remoteStore';
import Leaderboard from './components/Leaderboard';
import ProgressionChart from './components/ProgressionChart';
import MatchList from './components/MatchList';
import BonusQuestions from './components/BonusQuestions';
import GroupTables from './components/GroupTables';
import TeamCards from './components/TeamCards';
import PlayerStats from './components/PlayerStats';
import AdminPanel from './components/AdminPanel';
import { useStats, type AutoBonus } from './hooks/useStats';
import { normalizeTeamName } from './utils/teamNames';
import { deriveDecidedBonus, deriveStatsBonus } from './utils/autoDerive';

type View = 'tabell' | 'kamper' | 'krydder' | 'stats';

/** Auto-krydder fra aggregatoren → BonusStore-form (norske lagnavn + per-lag-datoer). */
function autoBonusToStore(auto: AutoBonus | undefined): BonusStore {
  const store: BonusStore = {};
  for (const qid of ['q7', 'q8'] as const) {
    const byTeam = auto?.[qid];
    if (!byTeam) continue;
    const ats: Record<string, string> = {};
    const answer: string[] = [];
    for (const [team, iso] of Object.entries(byTeam)) {
      const no = normalizeTeamName(team);
      if (!answer.includes(no)) answer.push(no);
      ats[no] = iso;
    }
    if (answer.length > 0) store[qid] = { answer, ats };
  }
  return store;
}

// Innbakt (delt) admin-data fra repoet. localStorage legges oppå som live-overstyring.
const KNOCKOUT_BAKED = knockoutBaked as KnockoutStore;
const BONUS_BAKED = bonusBaked as BonusStore;

function isAdminUrl(): boolean {
  return new URLSearchParams(window.location.search).get('admin') === 'true';
}

export default function App() {
  const { results, loading, error, lastUpdated, refresh } = useMatches();
  const [view, setView] = useState<View>('kamper');
  const [tableView, setTableView] = useState<'tabell' | 'graf'>('tabell');
  const [statsView, setStatsView] = useState<'lag' | 'spiller'>('lag');
  // Hentes alltid (ikke bare på Stats-fanen): brukes også til auto-krydder (q7/q8).
  const { data: stats } = useStats(true);
  const [adminOpen, setAdminOpen] = useState(isAdminUrl);

  // Initialiseres fra localStorage-cache (rask visning), oppdateres så fra KV (delt sannhet).
  const [knockoutStore, setKnockoutStore] = useState<KnockoutStore>(loadKnockoutStore);
  const [bonusStore, setBonusStore] = useState<BonusStore>(loadBonusStore);

  // Hent delt admin-data fra KV ved oppstart, jevnlig (live), og når fanen blir synlig
  // igjen. Cache i localStorage så reload viser siste kjente fasit umiddelbart. Slik
  // dukker f.eks. ny selvmål-/rødt kort-fasit opp i tabellen LIVE – ikke først ved reload.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const remote = await fetchRemoteState();
      if (cancelled || !remote) return;
      if (remote.knockoutTips) {
        setKnockoutStore(remote.knockoutTips);
        saveKnockoutStore(remote.knockoutTips);
      }
      if (remote.bonusAnswers) {
        setBonusStore(remote.bonusAnswers);
        saveBonusStore(remote.bonusAnswers);
      }
    };
    void sync();
    const onVisible = () => {
      if (!document.hidden) void sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    // Poll KV hvert 20. s mens fanen er synlig (edge-cachet → billig).
    const id = setInterval(() => {
      if (!document.hidden) void sync();
    }, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Skjul tittel-båndet ved scroll ned ved å gli HELE headeren opp med transform
  // (GPU-komposittert → ingen reflow/hakking), nøyaktig tittel-høyden, så fanene blir
  // liggende øverst. Scroll opp (eller til topps) → headeren glir ned igjen.
  const titleRef = useRef<HTMLDivElement>(null);
  const [titleH, setTitleH] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setTitleH(titleRef.current?.offsetHeight ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const [hideTitle, setHideTitle] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 64) setHideTitle(false);
      else if (y > lastY) setHideTitle(true); // skjul ved enhver nedover-scroll
      else if (y < lastY) setHideTitle(false); // vis ved enhver oppover-scroll
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Innbakt data + lokale (admin) overstyringer. localStorage vinner ved konflikt.
  const knockoutMerged = useMemo(() => ({ ...KNOCKOUT_BAKED, ...knockoutStore }), [knockoutStore]);
  // Admin ser/redigerer kun manuelle verdier (innbakt + KV) – auto flettes ikke inn her, så
  // auto-fasit «fryses» aldri ved lagring.
  const bonusManual = useMemo(() => ({ ...BONUS_BAKED, ...bonusStore }), [bonusStore]);
  // Auto-krydder, lagt UNDER manuell fasit (manuell KV overstyrer alltid auto):
  // q7/q8 fra aggregatoren (akkumulerende), q1/q5/q10 fra resultatene (låses når avgjort).
  const autoBonusStore = useMemo(() => autoBonusToStore(stats?.autoBonus), [stats?.autoBonus]);
  const autoDecided = useMemo(() => deriveDecidedBonus(results), [results]);
  const autoStats = useMemo(() => deriveStatsBonus(stats, results), [stats, results]);
  const bonusMerged = useMemo(
    () => ({ ...BONUS_BAKED, ...autoBonusStore, ...autoDecided, ...autoStats, ...bonusStore }),
    [autoBonusStore, autoDecided, autoStats, bonusStore],
  );

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

  // Krydder-fasit sine datoer for grafen (per spørsmål + per lag/element på liste-spørsmål).
  const bonusInfo = useMemo(() => {
    const m: Record<string, BonusDateInfo> = {};
    for (const [qid, v] of Object.entries(bonusMerged)) {
      const at = bonusDateOf(v);
      const ats = bonusItemDatesOf(v);
      if (at || ats) m[qid] = { at, ats };
    }
    return m;
  }, [bonusMerged]);

  // Poengutvikling for grafen.
  const progression = useMemo(
    () => computeProgression(participants, results, questions, bonusInfo),
    [participants, results, questions, bonusInfo],
  );

  if (adminOpen) {
    return (
      <AdminPanel
        results={results}
        participants={PARTICIPANTS}
        questions={BONUS_QUESTIONS}
        knockoutStore={knockoutMerged}
        bonusStore={bonusManual}
        loading={loading}
        onSaveKnockout={(s, password) => {
          setKnockoutStore(s);
          saveKnockoutStore(s); // optimistisk lokal cache
          return saveRemoteState(password, { knockoutTips: s }); // publiser til KV
        }}
        onSaveBonus={(s, password) => {
          setBonusStore(s);
          saveBonusStore(s);
          return saveRemoteState(password, { bonusAnswers: s });
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
      <header
        className="sticky top-0 z-10 border-b border-slate-700 transition-transform duration-200 ease-out"
        style={{ transform: `translateY(${hideTitle ? -titleH : 0}px)` }}
      >
        {/* Tittel-bånd: diagonale offisielle farger + mørkt slør for lesbar hvit tekst */}
        <div className="relative overflow-hidden">
          <div className="wc-stripes absolute inset-0" aria-hidden="true" />
          <div
            className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/80 to-slate-950/55"
            aria-hidden="true"
          />
          <div
            ref={titleRef}
            className="relative mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="/wc-logo.png"
                alt="FIFA VM 2026"
                className="h-11 w-auto shrink-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]"
              />
              <h1 className="min-w-0 truncate text-lg font-bold uppercase tracking-wide text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]">
                Tippekonk
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-white tabular-nums [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
                {lastUpdated ? `Oppdatert ${formatTime(lastUpdated)}` : ''}
              </span>
              {/* Tannhjul → admin. Manuell refresh ligger nå inne i admin (RefreshTab),
                  så vanlige brukere bruker auto-oppdateringen (hvert 25. s). */}
              <button
                type="button"
                onClick={() => {
                  window.history.replaceState(null, '', '?admin=true');
                  setAdminOpen(true);
                }}
                className="flex h-11 w-11 items-center justify-center text-white/35 transition hover:text-white/70 active:scale-95"
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
            </div>
          </div>

          {/* Faner – ligger inni stripe-båndet, så de deler header-bakgrunnen */}
          <div className="relative mx-auto flex max-w-2xl gap-1 px-4 pb-2">
            <TabButton active={view === 'tabell'} onClick={() => setView('tabell')}>
              Stilling
            </TabButton>
            <TabButton active={view === 'kamper'} onClick={() => setView('kamper')}>
              Kamper
            </TabButton>
            <TabButton active={view === 'krydder'} onClick={() => setView('krydder')}>
              Krydder
            </TabButton>
            <TabButton active={view === 'stats'} onClick={() => setView('stats')}>
              Stats
            </TabButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-4">
        {error && (
          <p className="mb-4 rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
            {error}
          </p>
        )}

        {/* Enkel mobil-stil layout på alle skjermstørrelser: én kolonne, valgt fane. */}
        {view === 'tabell' && (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              <SubTab active={tableView === 'tabell'} onClick={() => setTableView('tabell')}>
                Tabell
              </SubTab>
              <SubTab active={tableView === 'graf'} onClick={() => setTableView('graf')}>
                Graf
              </SubTab>
            </div>
            {tableView === 'tabell' ? (
              <>
                <p className="px-1 text-center text-[11px] text-slate-500">
                  Trykk på et navn for å se hvor poengene kom fra
                </p>
                <Leaderboard
                  standings={standings}
                  participants={participants}
                  results={results}
                  questions={questions}
                />
              </>
            ) : (
              <>
                <p className="px-1 text-center text-[11px] text-slate-500">
                  Trykk på en spiller for å vise/skjule linja (standard: topp 3)
                </p>
                <ProgressionChart progression={progression} />
              </>
            )}
          </div>
        )}
        {view === 'kamper' && <MatchList results={results} participants={participants} />}
        {view === 'krydder' && (
          <div className="space-y-2">
            <p className="px-1 text-center text-[11px] text-slate-500">
              Trykk på et spørsmål for å se alle svar
            </p>
            <BonusQuestions questions={questions} participants={participants} results={results} />
          </div>
        )}
        {view === 'stats' && (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              <SubTab active={statsView === 'lag'} onClick={() => setStatsView('lag')}>
                Lagstats
              </SubTab>
              <SubTab active={statsView === 'spiller'} onClick={() => setStatsView('spiller')}>
                Spillerstats
              </SubTab>
            </div>
            {statsView === 'lag' ? (
              <div className="space-y-3">
                <p className="px-1 text-center text-[11px] text-slate-500">
                  Gruppetabeller · ± målforskjell · P poeng
                </p>
                <GroupTables results={results} />
                <TeamCards teamCards={stats?.teamCards ?? []} />
              </div>
            ) : (
              <PlayerStats data={stats} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function SubTab({
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
      className={`min-h-[34px] flex-1 rounded-lg px-2 text-sm font-semibold transition [text-shadow:0_1px_2px_rgb(0_0_0/0.6)] ${
        active ? 'wc-btn text-white shadow-sm' : 'bg-slate-800 text-slate-300 [text-shadow:none]'
      }`}
    >
      {children}
    </button>
  );
}
