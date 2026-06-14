import { useMemo, useState } from 'react';
import type { BonusQuestion, KnockoutTip, MatchResult, Participant, Stage } from '../types';
import { APP_CONFIG } from '../config';
import { STAGE_LABELS, STAGE_ORDER, formatKickoff } from '../utils/labels';
import { normalizeTeamName } from '../utils/teamNames';
import type { BonusStore, KnockoutStore } from '../utils/storage';

interface Props {
  results: MatchResult[];
  participants: Participant[];
  questions: BonusQuestion[];
  knockoutStore: KnockoutStore;
  bonusStore: BonusStore;
  loading: boolean;
  onSaveKnockout: (store: KnockoutStore) => void;
  onSaveBonus: (store: BonusStore) => void;
  onRefresh: () => void;
  onClearCache: () => void;
  onClose: () => void;
}

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'vm2026';
const AUTH_KEY = `${APP_CONFIG.storageSuffix}_admin_authed`;
// q7 (rødt kort) og q8 (selvmål): fasit er en LISTE med alle lag som gjorde det
// (deltakere får 1p per korrekt nevnt lag). Legges inn komma-separert.
const LIST_ANSWER_IDS = new Set(['q7', 'q8']);
const KNOCKOUT_STAGES = STAGE_ORDER.filter((s) => s !== 'GROUP_STAGE');

type Tab = 'sluttspill' | 'krydder' | 'oppdater';

async function copyJson(value: unknown): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    return true;
  } catch {
    return false;
  }
}

export default function AdminPanel(props: Props) {
  const [authed, setAuthed] = useState(() => localStorage.getItem(AUTH_KEY) === 'true');

  if (!authed) {
    return <Gate onClose={props.onClose} onAuthed={() => setAuthed(true)} />;
  }

  return <AdminContent {...props} onLogout={() => {
    localStorage.removeItem(AUTH_KEY);
    setAuthed(false);
  }} />;
}

function Gate({ onClose, onAuthed }: { onClose: () => void; onAuthed: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value === ADMIN_PASSWORD) {
      localStorage.setItem(AUTH_KEY, 'true');
      onAuthed();
    } else {
      setError(true);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-16 text-slate-100">
      <form onSubmit={submit} className="mx-auto max-w-sm space-y-4">
        <h1 className="text-xl font-bold">Admin – {APP_CONFIG.groupName}</h1>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="Passord"
          className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-slate-100"
        />
        {error && <p className="text-sm text-red-400">Feil passord.</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            className="min-h-[44px] flex-1 rounded-lg bg-wc-red font-semibold text-white"
          >
            Logg inn
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg border border-slate-700 px-4 text-slate-300"
          >
            Avbryt
          </button>
        </div>
      </form>
    </div>
  );
}

function AdminContent({
  results,
  participants,
  questions,
  knockoutStore,
  bonusStore,
  loading,
  onSaveKnockout,
  onSaveBonus,
  onRefresh,
  onClearCache,
  onClose,
  onLogout,
}: Props & { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('sluttspill');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-bold">Admin – {APP_CONFIG.groupName}</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300"
            >
              Logg ut
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-wc-red px-3 py-1.5 text-sm font-semibold text-white"
            >
              Til siden
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-3xl gap-1 px-4 pb-2">
          <TabBtn active={tab === 'sluttspill'} onClick={() => setTab('sluttspill')}>
            Sluttspill
          </TabBtn>
          <TabBtn active={tab === 'krydder'} onClick={() => setTab('krydder')}>
            Krydder-fasit
          </TabBtn>
          <TabBtn active={tab === 'oppdater'} onClick={() => setTab('oppdater')}>
            Oppdater
          </TabBtn>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {tab === 'sluttspill' && (
          <KnockoutTab
            results={results}
            participants={participants}
            store={knockoutStore}
            onSave={onSaveKnockout}
          />
        )}
        {tab === 'krydder' && (
          <BonusTab questions={questions} store={bonusStore} onSave={onSaveBonus} />
        )}
        {tab === 'oppdater' && (
          <RefreshTab loading={loading} onRefresh={onRefresh} onClearCache={onClearCache} />
        )}
      </main>
    </div>
  );
}

// --- Tab 1: sluttspill-tips ------------------------------------------------

function key(name: string, apiId: number, side: 'h' | 'a'): string {
  return `${name}${apiId}${side}`;
}

function KnockoutTab({
  results,
  participants,
  store,
  onSave,
}: {
  results: MatchResult[];
  participants: Participant[];
  store: KnockoutStore;
  onSave: (store: KnockoutStore) => void;
}) {
  const [stage, setStage] = useState<Stage>('ROUND_OF_32');
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const [name, tips] of Object.entries(store)) {
      for (const t of tips) {
        d[key(name, t.apiId, 'h')] = String(t.homeGoals);
        d[key(name, t.apiId, 'a')] = String(t.awayGoals);
      }
    }
    return d;
  });
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const matches = useMemo(
    () =>
      results
        .filter((m) => m.stage === stage && m.homeTeam !== 'TBD' && m.awayTeam !== 'TBD')
        .sort((a, b) => a.utcDate.localeCompare(b.utcDate)),
    [results, stage],
  );

  function setVal(name: string, apiId: number, side: 'h' | 'a', raw: string) {
    const v = raw.replace(/\D/g, '').slice(0, 2);
    setDraft((d) => ({ ...d, [key(name, apiId, side)]: v }));
    setSaved(false);
    setCopied(false);
  }

  function buildStore(): KnockoutStore {
    const next: KnockoutStore = {};
    for (const p of participants) {
      const tips: KnockoutTip[] = [];
      for (const m of results) {
        const h = draft[key(p.name, m.apiId, 'h')];
        const a = draft[key(p.name, m.apiId, 'a')];
        if (h !== undefined && h !== '' && a !== undefined && a !== '') {
          tips.push({ apiId: m.apiId, homeGoals: Number(h), awayGoals: Number(a) });
        }
      }
      if (tips.length) next[p.name] = tips;
    }
    return next;
  }

  function save() {
    onSave(buildStore());
    setSaved(true);
  }

  async function exportJson() {
    if (await copyJson(buildStore())) setCopied(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {KNOCKOUT_STAGES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStage(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              stage === s ? 'bg-wc-red text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {STAGE_LABELS[s]}
          </button>
        ))}
      </div>

      {matches.length === 0 ? (
        <p className="rounded-lg border border-slate-700 bg-slate-800 p-4 text-sm text-slate-400">
          Ingen kamper med kjent oppsett for {STAGE_LABELS[stage].toLowerCase()} ennå. Kampene dukker
          opp her når lagene er klare (hent gjerne nye resultater under «Oppdater»).
        </p>
      ) : (
        matches.map((m) => (
          <KnockoutMatch
            key={m.apiId}
            match={m}
            participants={participants}
            draft={draft}
            onChange={setVal}
          />
        ))
      )}

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-slate-700 bg-slate-900/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            className="min-h-[44px] flex-1 rounded-lg bg-wc-red font-semibold text-white"
          >
            Lagre {saved && '✓'}
          </button>
          <button
            type="button"
            onClick={() => void exportJson()}
            className="min-h-[44px] rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200"
          >
            Eksporter JSON
          </button>
        </div>
        {copied && (
          <p className="text-xs text-emerald-400">
            Kopiert ✓ – lim inn i <code>src/data/knockoutTips.json</code>, så push til GitHub.
          </p>
        )}
      </div>
    </div>
  );
}

function KnockoutMatch({
  match,
  participants,
  draft,
  onChange,
}: {
  match: MatchResult;
  participants: Participant[];
  draft: Record<string, string>;
  onChange: (name: string, apiId: number, side: 'h' | 'a', raw: string) => void;
}) {
  const home = normalizeTeamName(match.homeTeam);
  const away = normalizeTeamName(match.awayTeam);

  return (
    <details className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium">
        {home} – {away}
        <span className="ml-2 text-xs text-slate-500">{formatKickoff(match.utcDate)}</span>
      </summary>
      <ul className="divide-y divide-slate-700/70 border-t border-slate-700">
        {participants.map((p) => (
          <li key={p.name} className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
            <GoalInput
              value={draft[key(p.name, match.apiId, 'h')] ?? ''}
              onChange={(v) => onChange(p.name, match.apiId, 'h', v)}
              aria-label={`${p.name} ${home}`}
            />
            <span className="text-slate-500">–</span>
            <GoalInput
              value={draft[key(p.name, match.apiId, 'a')] ?? ''}
              onChange={(v) => onChange(p.name, match.apiId, 'a', v)}
              aria-label={`${p.name} ${away}`}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

// --- Tab 2: krydder-fasit --------------------------------------------------

function BonusTab({
  questions,
  store,
  onSave,
}: {
  questions: BonusQuestion[];
  store: BonusStore;
  onSave: (store: BonusStore) => void;
}) {
  // Draft som tekst per spørsmål. For liste-spørsmål (q7/q8) er teksten komma-separert.
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const [id, val] of Object.entries(store)) {
      d[id] = Array.isArray(val) ? val.join(', ') : val;
    }
    return d;
  });
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  function setVal(id: string, v: string) {
    setDraft((d) => ({ ...d, [id]: v }));
    setSaved(false);
    setCopied(false);
  }

  function buildStore(): BonusStore {
    const next: BonusStore = {};
    for (const q of questions) {
      const raw = (draft[q.id] ?? '').trim();
      if (!raw) continue;
      if (LIST_ANSWER_IDS.has(q.id)) {
        const arr = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (arr.length) next[q.id] = arr;
      } else {
        next[q.id] = raw;
      }
    }
    return next;
  }

  function save() {
    onSave(buildStore());
    setSaved(true);
  }

  async function exportJson() {
    if (await copyJson(buildStore())) setCopied(true);
  }

  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <div key={q.id} className="rounded-xl border border-slate-700 bg-slate-800 p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-sm">{q.question}</p>
            <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300">
              {q.maxPoints}p
            </span>
          </div>
          <TextInput
            value={draft[q.id] ?? ''}
            onChange={(v) => setVal(q.id, v)}
            placeholder={
              LIST_ANSWER_IDS.has(q.id)
                ? 'Alle lag, komma-separert (Norge, Brasil, …)'
                : 'Fasit (tom = ikke avgjort)'
            }
          />
          {LIST_ANSWER_IDS.has(q.id) && (
            <p className="mt-1 text-[11px] text-slate-500">
              Legg inn alle lagene som gjorde det – deltakerne får 1p per korrekt nevnt lag (maks{' '}
              {q.maxPoints}p hver).
            </p>
          )}
        </div>
      ))}

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-slate-700 bg-slate-900/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            className="min-h-[44px] flex-1 rounded-lg bg-wc-red font-semibold text-white"
          >
            Lagre fasit {saved && '✓'}
          </button>
          <button
            type="button"
            onClick={() => void exportJson()}
            className="min-h-[44px] rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200"
          >
            Eksporter JSON
          </button>
        </div>
        {copied && (
          <p className="text-xs text-emerald-400">
            Kopiert ✓ – lim inn i <code>src/data/bonusAnswers.json</code>, så push til GitHub.
          </p>
        )}
      </div>
    </div>
  );
}

// --- Tab 3: oppdater -------------------------------------------------------

function RefreshTab({
  loading,
  onRefresh,
  onClearCache,
}: {
  loading: boolean;
  onRefresh: () => void;
  onClearCache: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Tving henting av nye resultater fra API-et. Nullstiller den lokale 5-minutters-cachen.
      </p>
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          onClearCache();
          onRefresh();
        }}
        className="min-h-[44px] w-full rounded-lg bg-wc-red font-semibold text-white disabled:opacity-50"
      >
        {loading ? 'Henter …' : 'Tøm cache og hent på nytt'}
      </button>
    </div>
  );
}

// --- Felles input-komponenter ----------------------------------------------

function GoalInput({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  'aria-label'?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-11 rounded-lg border border-slate-700 bg-slate-900 text-center text-slate-100"
      {...rest}
    />
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-600"
    />
  );
}

function TabBtn({
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
      className={`min-h-[40px] flex-1 rounded-lg px-2 text-sm font-semibold transition ${
        active ? 'bg-wc-red text-white' : 'bg-slate-800 text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
