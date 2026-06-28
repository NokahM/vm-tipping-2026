import { useEffect, useMemo, useState } from 'react';
import type { BonusQuestion, KnockoutTip, MatchResult, Participant, Stage } from '../types';
import { APP_CONFIG } from '../config';
import { STAGE_LABELS, STAGE_ORDER, formatKickoff } from '../utils/labels';
import { normalizeTeamName } from '../utils/teamNames';
import {
  bonusAnswerOf,
  bonusDateOf,
  bonusItemDatesOf,
  type BonusStore,
  type KnockoutStore,
} from '../utils/storage';
import { verifyPassword, type SaveResult } from '../utils/remoteStore';
import VictoryPopup from './VictoryPopup';

interface Props {
  results: MatchResult[];
  participants: Participant[];
  questions: BonusQuestion[];
  knockoutStore: KnockoutStore;
  bonusStore: BonusStore;
  autoBonus: BonusStore;
  autoPreliminary: Record<string, string>;
  previewWinners: string[];
  loading: boolean;
  error: string | null;
  onSaveKnockout: (store: KnockoutStore, password: string) => Promise<SaveResult>;
  onSaveBonus: (store: BonusStore, password: string) => Promise<SaveResult>;
  onRefresh: () => void;
  onClearCache: () => void;
  onClose: () => void;
}

const AUTH_KEY = `${APP_CONFIG.storageSuffix}_admin_authed`;
// Passordet huskes i admin sin egen nettleser så lagring (server-side sjekk) fungerer
// etter reload. Det sjekkes ALDRI mot en innebygd verdi – kun mot serveren (ADMIN_PASSWORD),
// så passordet finnes aldri i klient-bundelen. localStorage er admins egen enhet.
const PW_KEY = `${APP_CONFIG.storageSuffix}_admin_pw`;
// Spørsmål med liste-fasit (komma-separert input): q7 (rødt kort), q8 (selvmål), q15 (kjendis)
// og q20 (Superior Player of the Match). q7/q8/q20 gir 2p per korrekt; q15 full pott om i lista.
const LIST_ANSWER_IDS = new Set(['q7', 'q8', 'q15', 'q20']);
const PER_TEAM_IDS = new Set(['q7', 'q8']);
// «Sett dato» vises kun for hendelsesbaserte spørsmål (skjer på en bestemt tidligere dag,
// kan trenge tilbakedatering). Alt vi først vet ved VM-slutt får dagens/auto-dato uansett.
const DATE_OVERRIDE_IDS = new Set(['q6', 'q7', 'q8', 'q15']);
// Spørsmål som settes automatisk fra deep data/resultater (admin trenger ikke gjøre noe).
// Resten (q2, q4, q6, q15, q20) krever manuell fasit.
const AUTO_IDS = new Set(['q1', 'q3', 'q5', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12', 'q13', 'q14', 'q16', 'q17', 'q18', 'q19']);
// Akkumulerende: poeng deles ut løpende, men lista kan vokse til turneringsslutt («ikke avsluttet»).
const ACCUMULATING_IDS = new Set(['q7', 'q8', 'q15']); // rødt kort, selvmål, kjendis-dødsfall
const KNOCKOUT_STAGES = STAGE_ORDER.filter((s) => s !== 'GROUP_STAGE');

/** Dagens dato i NORSK tid (yyyy-mm-dd), uavhengig av enhetens tidssone. sv-SE gir ISO-format. */
function todayOsloYMD(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
}

/** Auto-svar som lesbar tekst (read-only hint i admin), eller tomt om auto ikke har funnet noe. */
function autoText(v: BonusStore[string] | undefined): string {
  if (v === undefined) return '';
  const ans = bonusAnswerOf(v);
  return Array.isArray(ans) ? ans.join(', ') : ans;
}

type Tab = 'sluttspill' | 'krydder' | 'oppdater';
type SaveState = 'idle' | 'saving' | 'ok' | 'error';

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
  const [password, setPassword] = useState(() => localStorage.getItem(PW_KEY) ?? '');

  if (!authed) {
    return (
      <Gate
        onClose={props.onClose}
        onAuthed={(pw) => {
          setPassword(pw);
          setAuthed(true);
        }}
      />
    );
  }

  return (
    <AdminContent
      {...props}
      password={password}
      onLogout={() => {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(PW_KEY);
        setAuthed(false);
      }}
    />
  );
}

function Gate({ onClose, onAuthed }: { onClose: () => void; onAuthed: (pw: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (checking || !value) return;
    setChecking(true);
    setError(false);
    // Eneste ekte sjekk: serveren (ADMIN_PASSWORD via /api/state). Ingen innebygd verdi.
    const ok = await verifyPassword(value);
    setChecking(false);
    if (ok) {
      localStorage.setItem(AUTH_KEY, 'true');
      localStorage.setItem(PW_KEY, value);
      onAuthed(value);
    } else {
      setError(true);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-16 text-slate-100">
      <form onSubmit={submit} className="mx-auto max-w-sm space-y-4">
        <h1 className="text-xl font-bold">Admin</h1>
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
            disabled={checking}
            className="min-h-[44px] flex-1 rounded-lg bg-wc-red font-semibold text-white disabled:opacity-60"
          >
            {checking ? 'Sjekker …' : 'Logg inn'}
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
  autoBonus,
  autoPreliminary,
  previewWinners,
  loading,
  error,
  password,
  onSaveKnockout,
  onSaveBonus,
  onRefresh,
  onClearCache,
  onClose,
  onLogout,
}: Props & { password: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('sluttspill');
  const [testVictory, setTestVictory] = useState(false);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-bold">Admin</h1>
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
              Tilbake
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-3xl gap-1 px-4 pb-2">
          <TabBtn active={tab === 'sluttspill'} onClick={() => setTab('sluttspill')}>
            Sluttspill
          </TabBtn>
          <TabBtn active={tab === 'krydder'} onClick={() => setTab('krydder')}>
            Krydder
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
            password={password}
            onSave={onSaveKnockout}
          />
        )}
        {tab === 'krydder' && (
          <BonusTab
            questions={questions}
            store={bonusStore}
            autoBonus={autoBonus}
            autoPreliminary={autoPreliminary}
            password={password}
            onSave={onSaveBonus}
          />
        )}
        {tab === 'oppdater' && (
          <RefreshTab
            loading={loading}
            error={error}
            onRefresh={onRefresh}
            onClearCache={onClearCache}
          />
        )}
        {/* Subtil test-link: forhåndsvis vinner-feiringen (vises egentlig kun når VM er over). */}
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setTestVictory(true)}
            className="text-[11px] text-slate-600 hover:text-slate-400"
          >
            🎉 Test: vis vinner-feiring
          </button>
        </div>
      </main>
      {testVictory && (
        <VictoryPopup winners={previewWinners} onClose={() => setTestVictory(false)} />
      )}
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
  password,
  onSave,
}: {
  results: MatchResult[];
  participants: Participant[];
  store: KnockoutStore;
  password: string;
  onSave: (store: KnockoutStore, password: string) => Promise<SaveResult>;
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
  const [status, setStatus] = useState<SaveState>('idle');
  const [errMsg, setErrMsg] = useState('');

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
    setStatus('idle');
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

  async function save() {
    setStatus('saving');
    const r = await onSave(buildStore(), password);
    if (r.ok) {
      setStatus('ok');
    } else {
      setStatus('error');
      setErrMsg(r.error ?? 'Ukjent feil.');
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-[11px] text-slate-400">
        Legg inn <span className="text-slate-300">2-talls sluttspill-tips</span> per deltaker, per
        kamp. Velg runde under – kampene dukker opp automatisk fra API-et når lagene er trukket
        (kamper med ukjent lag skjules til de er klare). Tips knyttes til kampen via kampens ID, så de
        teller når resultatet kommer. Husk <span className="text-slate-300">«Lagre &amp; publiser»</span>
        nederst → synlig for alle.
      </p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Velg runde
        </span>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value as Stage)}
          className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm font-medium text-slate-100"
        >
          {KNOCKOUT_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

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

      <PublishBar
        label="Lagre & publiser"
        status={status}
        errMsg={errMsg}
        onSave={() => void save()}
        onExport={() => copyJson(buildStore())}
      />
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
  autoBonus,
  autoPreliminary,
  password,
  onSave,
}: {
  questions: BonusQuestion[];
  store: BonusStore;
  autoBonus: BonusStore;
  autoPreliminary: Record<string, string>;
  password: string;
  onSave: (store: BonusStore, password: string) => Promise<SaveResult>;
}) {
  // Draft som tekst per spørsmål. For liste-spørsmål (q7/q8) er teksten komma-separert.
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const [id, val] of Object.entries(store)) {
      const ans = bonusAnswerOf(val);
      d[id] = Array.isArray(ans) ? ans.join(', ') : ans;
    }
    return d;
  });
  // «Avgjort»-dato (yyyy-mm-dd) for enkelt-spørsmål; native velger viser dd.mm.åååå på norsk.
  const [dateDraft, setDateDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const [id, val] of Object.entries(store)) {
      const at = bonusDateOf(val);
      if (at) d[id] = at.slice(0, 10);
    }
    return d;
  });
  // Per-lag/element-dato for liste-spørsmål: questionId → (svar → yyyy-mm-dd).
  const [itemDates, setItemDates] = useState<Record<string, Record<string, string>>>(() => {
    const d: Record<string, Record<string, string>> = {};
    for (const [id, val] of Object.entries(store)) {
      const ats = bonusItemDatesOf(val);
      if (ats) {
        d[id] = {};
        for (const [team, iso] of Object.entries(ats)) d[id][team] = iso.slice(0, 10);
      }
    }
    return d;
  });
  // Hvilke spørsmål som har dato-velgeren utfoldet (kun UI). Skjult som standard.
  const [showDate, setShowDate] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<SaveState>('idle');
  const [errMsg, setErrMsg] = useState('');

  function setVal(id: string, v: string) {
    setDraft((d) => ({ ...d, [id]: v }));
    setStatus('idle');
  }

  function setDate(id: string, v: string) {
    setDateDraft((d) => ({ ...d, [id]: v }));
    setStatus('idle');
  }

  function setItemDate(id: string, team: string, v: string) {
    setItemDates((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [team]: v } }));
    setStatus('idle');
  }

  // Nullstill et auto-spørsmål: tøm det manuelle svaret så API-et/auto overtar igjen.
  // (Tomt felt lagres ikke → fjernes fra KV → auto-fasit gjelder etter «Lagre & publiser».)
  function resetToAuto(id: string) {
    setDraft((d) => ({ ...d, [id]: '' }));
    setDateDraft((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    setItemDates((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    setShowDate((s) => ({ ...s, [id]: false }));
    setStatus('idle');
  }

  function buildStore(): BonusStore {
    const next: BonusStore = {};
    // Dato lagres kl. 12 UTC så den havner på riktig kalenderdag uansett tidssone.
    // Default (ikke valgt) = dagens NORSKE dato, så det ikke hopper til gårsdagen ved midnatt.
    const toIso = (ymd: string) => `${ymd}T12:00:00.000Z`;
    const today = toIso(todayOsloYMD());
    for (const q of questions) {
      const raw = (draft[q.id] ?? '').trim();
      if (!raw) continue;
      if (LIST_ANSWER_IDS.has(q.id)) {
        const arr = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (!arr.length) continue;
        // Per-lag-dato: admin sitt valg, ellers i dag (norsk).
        const ats: Record<string, string> = {};
        for (const team of arr) {
          const dv = itemDates[q.id]?.[team];
          ats[team] = dv ? toIso(dv) : today;
        }
        next[q.id] = { answer: arr, ats };
      } else {
        const picked = dateDraft[q.id];
        const at = picked ? toIso(picked) : (bonusDateOf(store[q.id] ?? '') ?? today);
        next[q.id] = { answer: raw, at };
      }
    }
    return next;
  }

  async function save() {
    setStatus('saving');
    const r = await onSave(buildStore(), password);
    if (r.ok) {
      setStatus('ok');
    } else {
      setStatus('error');
      setErrMsg(r.error ?? 'Ukjent feil.');
    }
  }

  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-[11px] text-slate-400">
        <span className="text-emerald-400/90">Automatisk</span> = API-et henter svaret selv – la
        feltet stå tomt. <span className="text-amber-400/90">Manuell</span> = API-et får ikke tak i
        dataene – skriv inn fasit selv. <span className="text-slate-300">Raskeste mål</span> er
        manuelt, men API-et hjelper til med å peke ut målet (det kjenner bare minuttet, ikke sekundet
        – så scoret to lag i samme minutt, må du sette eksakt tid selv). Et utfylt + publisert svar
        teller med dagens dato; bruk «sett dato» for å tilbakedatere.
        <br />
        <span className="text-slate-300">Tommelfingerregel:</span> ser du «Auto nå: X» og er enig,
        la feltet stå tomt – du skriver kun inn det auto ikke finner (q2, q4, q6, q15) eller det du
        vil overstyre.
      </p>
      {questions.map((q) => {
        const isList = LIST_ANSWER_IDS.has(q.id);
        const teams = isList
          ? (draft[q.id] ?? '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        // Bekreftelse på hva som faktisk er LAGRET som poenggivende (manuell KV overstyrer auto).
        const savedManual = autoText(store[q.id]);
        const counts = savedManual || autoText(autoBonus[q.id]);
        const overriddenAuto = AUTO_IDS.has(q.id) && savedManual !== '';
        const showCounts = overriddenAuto || (!AUTO_IDS.has(q.id) && counts !== '');
        return (
        <div key={q.id} className="rounded-xl border border-slate-700 bg-slate-800 p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-sm">
              {q.question}{' '}
              <span
                className={`text-[10px] ${AUTO_IDS.has(q.id) ? 'text-emerald-400/80' : 'text-amber-400/80'}`}
              >
                · {AUTO_IDS.has(q.id) ? 'automatisk' : 'manuell'}
              </span>
            </p>
            <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300">
              {q.maxPoints}p
            </span>
          </div>
          <TextInput
            value={draft[q.id] ?? ''}
            onChange={(v) => setVal(q.id, v)}
            placeholder={
              AUTO_IDS.has(q.id)
                ? 'La stå tomt (skriv for å overstyre)'
                : !LIST_ANSWER_IDS.has(q.id)
                  ? 'Fasit (tom = ikke avgjort)'
                  : PER_TEAM_IDS.has(q.id)
                    ? 'Alle lag, komma-separert (Norge, Brasil, …)'
                    : 'Alle, komma-separert (Pave Frans, Charter-Svein, …)'
            }
          />
          {LIST_ANSWER_IDS.has(q.id) && (
            <p className="mt-1 text-[11px] text-slate-500">
              {PER_TEAM_IDS.has(q.id)
                ? `Legg inn alle lagene som gjorde det – deltakerne får ${q.maxPoints / 2}p per korrekt nevnt lag (maks ${q.maxPoints}p hver).`
                : `Legg inn alle som gjelder – deltakeren får full pott (${q.maxPoints}p) hvis sitt svar er i lista.`}
            </p>
          )}
          {autoText(autoBonus[q.id]) ? (
            <p className="mt-1 text-[11px] text-emerald-400/80">
              Auto nå: <span className="text-emerald-300">{autoText(autoBonus[q.id])}</span>
              {ACCUMULATING_IDS.has(q.id) && (
                <span className="text-slate-500"> · ikke avsluttet</span>
              )}
              {(draft[q.id] ?? '').trim() !== '' && (
                <span className="text-slate-500"> · overstyres av ditt svar</span>
              )}
            </p>
          ) : autoPreliminary[q.id] ? (
            <p className="mt-1 text-[11px] text-slate-400">
              Auto nå: <span className="text-amber-300">{autoPreliminary[q.id]}</span>
              <span className="text-slate-500"> – ikke avgjort ennå</span>
              {(draft[q.id] ?? '').trim() !== '' && (
                <span className="text-slate-500"> · overstyres av ditt svar</span>
              )}
            </p>
          ) : null}
          {showCounts && (
            <p className="mt-1 text-[11px] text-slate-400">
              ✓ Teller nå: <span className="text-slate-100">{counts}</span>
              {ACCUMULATING_IDS.has(q.id) && <span className="text-slate-500"> · ikke avsluttet</span>}
              {overriddenAuto && <span className="text-amber-300"> · overstyrer auto</span>}
            </p>
          )}
          {/* Valgfri dato-overstyring + «nullstill til auto» (kun når relevant) */}
          {(DATE_OVERRIDE_IDS.has(q.id) ||
            (AUTO_IDS.has(q.id) && (draft[q.id] ?? '').trim() !== '')) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {DATE_OVERRIDE_IDS.has(q.id) && (
                <button
                  type="button"
                  onClick={() => setShowDate((s) => ({ ...s, [q.id]: !s[q.id] }))}
                  className="text-[11px] text-slate-400 hover:text-slate-200"
                >
                  {showDate[q.id] ? 'Skjul dato' : '📅 sett dato'}
                </button>
              )}
              {AUTO_IDS.has(q.id) && (draft[q.id] ?? '').trim() !== '' && (
                <button
                  type="button"
                  onClick={() => resetToAuto(q.id)}
                  title="Tøm det manuelle svaret så API/auto overtar igjen"
                  className="text-[11px] text-emerald-400/80 hover:text-emerald-300"
                >
                  ↺ Nullstill til auto
                </button>
              )}
            </div>
          )}
          {showDate[q.id] &&
            (isList ? (
              teams.length > 0 ? (
                <div className="mt-2 space-y-1">
                  <p className="text-[11px] text-slate-400">Avgjort-dato per svar (→ grafen):</p>
                  {teams.map((team) => (
                    <div key={team} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{team}</span>
                      <input
                        type="date"
                        value={itemDates[q.id]?.[team] ?? ''}
                        onChange={(e) => setItemDate(q.id, team, e.target.value)}
                        className="h-8 rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
                      />
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-600">tom = i dag</p>
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-slate-600">Skriv inn svar først.</p>
              )
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <span className="shrink-0 text-[11px] text-slate-400">Avgjort-dato:</span>
                <input
                  type="date"
                  value={dateDraft[q.id] ?? ''}
                  onChange={(e) => setDate(q.id, e.target.value)}
                  className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
                />
                <span className="text-[11px] text-slate-600">tom = i dag</span>
              </div>
            ))}
        </div>
        );
      })}

      <PublishBar
        label="Lagre & publiser"
        status={status}
        errMsg={errMsg}
        onSave={() => void save()}
        onExport={() => copyJson(buildStore())}
      />
    </div>
  );
}

// --- Tab 3: oppdater -------------------------------------------------------

function RefreshTab({
  loading,
  error,
  onRefresh,
  onClearCache,
}: {
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClearCache: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<null | 'ok' | 'error'>(null);

  // Når en utløst henting er ferdig (loading false igjen), vis resultat.
  useEffect(() => {
    if (pending && !loading) {
      setPending(false);
      setResult(error ? 'error' : 'ok');
    }
  }, [pending, loading, error]);

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-[11px] text-slate-400">
        Tvinger henting av ferske resultater og tømmer den lokale kamp- og hendelses-cachen.
        <span className="text-slate-300"> Sjelden nødvendig</span> – edge-cachen (~8 s) og
        auto-pollingen (hvert 10. sek) holder tavla fersk av seg selv. Mest nyttig hvis noe ser
        fastlåst ut, eller for å hente nye sluttspill-kamper med en gang lagene er trukket.
      </p>
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          setResult(null);
          setPending(true);
          onClearCache();
          onRefresh();
        }}
        className="min-h-[44px] w-full rounded-lg bg-wc-red font-semibold text-white disabled:opacity-50"
      >
        {loading ? 'Henter …' : 'Tøm cache og hent på nytt'}
      </button>
      {result === 'ok' && (
        <p className="rounded-lg border border-emerald-700/50 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
          Oppdatert ✓ – ferske resultater hentet.
        </p>
      )}
      {result === 'error' && (
        <p className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          Kunne ikke hente: {error ?? 'ukjent feil'}
        </p>
      )}
    </div>
  );
}

// --- Felles publiserings-bar -----------------------------------------------

/**
 * Sticky bunn-bar: «Lagre & publiser» skriver til KV (synlig for alle), med status.
 * «Backup JSON» kopierer gjeldende data til utklippstavla som en valgfri snapshot
 * man kan lime inn i repoets JSON-filer (versjonert sikkerhetskopi).
 */
function PublishBar({
  label,
  status,
  errMsg,
  onSave,
  onExport,
}: {
  label: string;
  status: SaveState;
  errMsg: string;
  onSave: () => void;
  onExport: () => Promise<boolean>;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-slate-700 bg-slate-900/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={status === 'saving'}
          className="min-h-[44px] flex-1 rounded-lg bg-wc-red text-sm font-semibold text-white disabled:opacity-60"
        >
          {status === 'saving' ? 'Publiserer …' : status === 'ok' ? `${label} ✓` : label}
        </button>
        <button
          type="button"
          onClick={async () => setCopied(await onExport())}
          className="min-h-[44px] rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200"
          title="Kopiér som JSON-backup"
        >
          Backup JSON
        </button>
      </div>
      {status === 'ok' && (
        <p className="text-xs text-emerald-400">Publisert ✓ – synlig for alle.</p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-400">Kunne ikke publisere: {errMsg}</p>
      )}
      {copied && status !== 'ok' && (
        <p className="text-xs text-emerald-400">Kopiert til utklippstavla ✓ (backup).</p>
      )}
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
