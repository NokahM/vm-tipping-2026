# VM Tipping 2026 – Live Poengtavle

## Prosjektoversikt

En React-webapplikasjon som viser live-poengtabell for to vennegjengers VM-tipping for fotball-VM 2026. Kampresultater hentes automatisk fra **football-data.org sitt API** etter at kamper er ferdigspilt. Sluttspill-tips legges inn i admin-panelet manuelt etter hvert som runder blir kjent.

## To vennegrupper

### Gruppe 1: Drammen
Deltakere: **Erling, Rune, Håkon, Geir, Tore, Tor Arne** (6 deltakere)

### Gruppe 2: Alles Tips
Deltakere: **Skjalg, Sindre, Anne Marte, Ole, Eirik, Margret, Håkon Emil, Morten, Hilde, Sofia, Nicholas, Trond, Anders, Ida, Erling, Håkon M, Bent Arne, Gunvor, Lisa, Espen, Jonas G, Kay Robin, Magnus, Jonas W, Viktor, Kajsa** (26 deltakere)

---

## Poengsystem

### Kampresultater
- **3 poeng** – Riktig eksakt resultat (f.eks. tip 2-1, fasit 2-1)
- **1 poeng** – Riktig utfall (seier/uavgjort/tap korrekt, men feil score)
- **0 poeng** – Feil utfall

### Krydderspørsmål
Poengene varierer per spørsmål og er individuelt bestemt av fasit-setter.

---

## Design: Mobile-first

Siden brukes primært på mobil. Design og implementasjon skal alltid ta utgangspunkt i mobilvisning først, og skalere opp til desktop.

### Krav
- **Mobilvisning (< 640px):** Primærmål. Leaderboard, kampresultater og krydderspørsmål skal være enkle å lese med én hånd på en liten skjerm.
- **Desktopvisning (≥ 1024px):** Skal se ryddig ut, men er sekundært. Bruk gjerne et bredere layout med kolonner der det gir mening (f.eks. leaderboard ved siden av kampene).
- **Touch-vennlig:** Knapper og interaktive elementer minst 44×44px (Apple HIG). Ingen hover-only interaksjon.
- **Rask innlasting:** Minimer bundle-størrelse. Ikke last inn biblioteker som ikke trengs.
- **Ingen horisontal scroll** på mobil.

### Tailwind-tilnærming
Bruk mobile-first breakpoints konsekvent:
```
// Riktig: start med mobil, utvid til større skjermer
className="flex flex-col md:flex-row"
className="text-sm md:text-base"
className="p-3 md:p-6"

// Feil: start med desktop og override ned
className="flex-row flex-col"  // unngå dette mønsteret
```

### Komponent-retningslinjer
- **Leaderboard:** Kompakt tabell på mobil (navn + poeng + rank). Ekstra kolonner (gruppep., sluttspill, bonus) vises på desktop.
- **Kamprad:** Stack vertikalt på mobil (hjemmelag øverst, bortelag under, resultat i midten). Horisontal layout på desktop.
- **Admin-panel:** Enkle skjemaer med store input-felter, fungerer godt med mobiltastatur.

---

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Styling:** Tailwind CSS (mobile-first)
- **Resultater:** football-data.org API (gratis, ingen backend nødvendig – kalles direkte fra klient)
- **Sluttspill-tips:** Admin-panel + localStorage
- **Deploy:** Vercel (Hobby-plan, gratis)
- **Repo:** Monorepo med to separate apper

---

## API: football-data.org

### Registrering
Gå til [football-data.org](https://www.football-data.org/client/register) og registrer en gratis konto. Du får en **API-nøkkel** (X-Auth-Token) som brukes i alle kall.

### VM 2026 – Competition code
```
WC  →  FIFA World Cup
```

### Relevante endepunkter

```
# Alle kamper i VM (gruppespill + sluttspill)
GET https://api.football-data.org/v4/competitions/WC/matches
  Header: X-Auth-Token: DIN_NØKKEL

# Kun ferdige kamper
GET https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED

# Kun en spesifikk runde (stage)
GET https://api.football-data.org/v4/competitions/WC/matches?stage=GROUP_STAGE
GET https://api.football-data.org/v4/competitions/WC/matches?stage=ROUND_OF_32
GET https://api.football-data.org/v4/competitions/WC/matches?stage=ROUND_OF_16
GET https://api.football-data.org/v4/competitions/WC/matches?stage=QUARTER_FINALS
GET https://api.football-data.org/v4/competitions/WC/matches?stage=SEMI_FINALS
GET https://api.football-data.org/v4/competitions/WC/matches?stage=THIRD_PLACE
GET https://api.football-data.org/v4/competitions/WC/matches?stage=FINAL
```

### Eksempel på API-respons (én kamp)
```json
{
  "id": 123456,
  "utcDate": "2026-06-11T19:00:00Z",
  "status": "FINISHED",
  "stage": "GROUP_STAGE",
  "group": "GROUP_A",
  "homeTeam": { "id": 759, "name": "Mexico", "shortName": "Mexico", "tla": "MEX" },
  "awayTeam": { "id": 801, "name": "South Africa", "shortName": "South Africa", "tla": "RSA" },
  "score": {
    "winner": "HOME_TEAM",
    "fullTime": { "home": 2, "away": 0 },
    "halfTime": { "home": 1, "away": 0 }
  }
}
```

### Rategrenser (gratis-plan)
- 10 kall per minutt
- Ingen daglig grense
- **Strategi:** Poll hvert 5. minutt i en timer etter kampstart, deretter kun ved sideinnlasting. For en vennekonkurranse er dette langt mer enn nok.

### Throttling via response headers (viktig!)
API-eieren ber eksplisitt om at klienten leser response headers for å unngå å treffe ratelimiteren. Implementer dette i `apiClient.ts`:

```typescript
const BASE_URL = 'https://api.football-data.org/v4';
const API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY;

let requestsAvailable = 10; // starter optimistisk

export async function fetchWCMatches(status?: 'FINISHED' | 'SCHEDULED' | 'IN_PLAY') {
  if (requestsAvailable <= 0) {
    console.warn('Ratelimit nådd – bruker cachet data');
    return null;
  }

  const params = status ? `?status=${status}` : '';
  const res = await fetch(`${BASE_URL}/competitions/WC/matches${params}`, {
    headers: { 'X-Auth-Token': API_KEY }
  });

  // Les throttling-headers fra API-et
  const remaining = res.headers.get('X-Requests-Available-Minute');
  const resetAt = res.headers.get('X-RequestCounter-Reset');
  if (remaining !== null) requestsAvailable = parseInt(remaining, 10);

  console.debug(`API: ${remaining} kall igjen, reset: ${resetAt}`);

  if (res.status === 429) {
    console.warn('Rate limit truffet – vent til neste minutt');
    return null;
  }

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

### Miljøvariabel
```
VITE_FOOTBALL_API_KEY=din_nøkkel_her
```
- Sett i Vercel under **Settings → Environment Variables** for hvert prosjekt
- Lokalt: lag `.env.local` i app-mappen (aldri commit denne filen)
- **Aldri hardkod nøkkelen i koden eller legg den i CLAUDE.md**

### Viktig: CORS – proxy er nødvendig (oppdatert 2026-06-13)
**Opprinnelig antakelse om at CORS er åpent stemmer IKKE.** football-data.org svarer
med `Access-Control-Allow-Origin: http://localhost` (uten portnummer), som ikke matcher
verken `http://localhost:5173` eller produksjons-URL-en. Nettleseren blokkerer derfor
alle direkte kall («NetworkError»). Server-til-server-kall (PowerShell/curl) fungerer fint.

**Løsning – proxy på samme origin:**
- **Dev:** Vite dev-server proxier `/api/matches` → `https://api.football-data.org/v4/competitions/WC/matches`
  og legger på `X-Auth-Token` server-side (se `vite.config.ts`).
- **Prod (Vercel):** serverless-funksjon `api/matches.js` gjør det samme.
- **Klienten** kaller alltid `/api/matches?status=...&stage=...` (samme origin → ingen CORS).
- **Bonus:** API-nøkkelen havner aldri i klient-bundelen.

### Miljøvariabel – server-side nøkkel
Nøkkelen brukes nå kun server-side. Sett **`FOOTBALL_API_KEY`** (uten `VITE_`-prefiks) i
Vercel og i lokal `.env.local`. For bakoverkompatibilitet leser både dev-proxyen og
serverless-funksjonen også `VITE_FOOTBALL_API_KEY` som fallback.

---

## Tipping-struktur: To faser

### Fase 1 – Gruppespill (allerede tipset)
Alle deltakere har tipset alle 72 gruppespill-kamper i Excel-filene. Disse er ferdiginnlastet i `participants.ts`.

### Fase 2 – Sluttspill (tips kommer underveis)
Deltakerne kjenner ikke lagene i sluttspillet på forhånd. Tipseinnsamling skjer manuelt per runde:

| Runde | Antall kamper | Når tips samles inn |
|-------|---------------|---------------------|
| Sekstendelsfinaler (R32) | 16 | Etter gruppespillet er ferdig |
| Åttendelsfinaler (R16) | 8 | Etter R32 |
| Kvartfinaler | 4 | Etter R16 |
| Semifinaler | 2 | Etter kvartfinaler |
| Bronsefinale | 1 | Etter semifinaler |
| Finale | 1 | Etter semifinaler |

**Arbeidsflyt for sluttspill:**
1. Runden starter → du samler inn tips fra deltakerne (WhatsApp e.l.)
2. Du åpner admin-panelet → legger inn tips for alle deltakere for den runden
3. Appen beregner automatisk poeng når API-et returnerer resultater

---

## Monorepo-struktur

Ett GitHub-repo, to Vite-apper, to Vercel-prosjekter.

```
vm-tipping-2026/                    # GitHub-repo (root)
├── apps/
│   ├── drammen/                    # App 1 → vm-drammen.vercel.app
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Leaderboard.tsx
│   │   │   │   ├── MatchList.tsx
│   │   │   │   ├── MatchRow.tsx
│   │   │   │   ├── BonusQuestions.tsx
│   │   │   │   └── AdminPanel.tsx
│   │   │   ├── data/
│   │   │   │   ├── participants.ts     # Gruppespill-tips (fra Excel)
│   │   │   │   ├── knockoutTips.ts     # Sluttspill-tips (fra localStorage via admin)
│   │   │   │   └── bonusQuestions.ts   # 17 krydderspørsmål + tips
│   │   │   ├── hooks/
│   │   │   │   └── useMatches.ts       # Henter og cacher resultater fra API
│   │   │   ├── utils/
│   │   │   │   ├── scoring.ts
│   │   │   │   └── apiClient.ts        # Wrapper for football-data.org
│   │   │   ├── types.ts
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   │
│   └── alles/                      # App 2 → vm-alles.vercel.app
│       └── src/                    # Identisk struktur, annen participants.ts
│
├── CLAUDE.md
└── README.md
```

---

## API-klient (`src/utils/apiClient.ts`)

```typescript
const BASE_URL = 'https://api.football-data.org/v4';
const API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY;

export async function fetchWCMatches(status?: 'FINISHED' | 'SCHEDULED' | 'IN_PLAY') {
  const params = status ? `?status=${status}` : '';
  const res = await fetch(`${BASE_URL}/competitions/WC/matches${params}`, {
    headers: { 'X-Auth-Token': API_KEY }
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

## API-hook med caching (`src/hooks/useMatches.ts`)

```typescript
import { useState, useEffect } from 'react';
import { fetchWCMatches } from '../utils/apiClient';
import { MatchResult } from '../types';

const CACHE_KEY = 'wc2026_results';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutter

export function useMatches() {
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) {
        setResults(data);
        setLastUpdated(new Date(timestamp));
        setLoading(false);
        return;
      }
    }
    fetchAndCache();
  }, []);

  async function fetchAndCache() {
    try {
      const json = await fetchWCMatches('FINISHED');
      const mapped: MatchResult[] = json.matches.map((m: any) => ({
        apiId: m.id,
        stage: m.stage,
        group: m.group,
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
        homeGoals: m.score.fullTime.home,
        awayGoals: m.score.fullTime.away,
        status: m.status,
        utcDate: m.utcDate,
      }));
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: mapped, timestamp: Date.now() }));
      setResults(mapped);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Kunne ikke hente resultater:', e);
    } finally {
      setLoading(false);
    }
  }

  return { results, loading, lastUpdated, refresh: fetchAndCache };
}
```

---

## TypeScript-typer (`src/types.ts`)

```typescript
export type Outcome = 'home' | 'draw' | 'away';

export type Stage =
  | 'GROUP_STAGE'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL';

export interface MatchResult {
  apiId: number;           // football-data.org sin kamp-ID
  stage: Stage;
  group?: string;          // "GROUP_A" etc., kun for gruppespill
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  status: 'FINISHED' | 'SCHEDULED' | 'IN_PLAY';
  utcDate: string;
}

export interface GroupTip {
  // Matchet mot MatchResult via homeTeam + awayTeam + group
  homeTeam: string;
  awayTeam: string;
  group: string;
  homeGoals: number;
  awayGoals: number;
}

export interface KnockoutTip {
  // Matchet mot MatchResult via apiId (settes i admin etter at kampen er kjent)
  apiId: number;
  homeGoals: number;
  awayGoals: number;
}

export interface Participant {
  name: string;
  groupTips: GroupTip[];
  knockoutTips: KnockoutTip[];   // Legges inn via admin-panel per runde
}

export interface BonusTip {
  questionId: string;
  answer: string | string[];     // string[] for spørsmål med to svar (rødt kort etc.)
}

export interface BonusQuestion {
  id: string;
  question: string;
  maxPoints: number;
  answer: string | string[] | null;   // null = ikke avgjort ennå
}

export interface ParticipantScore {
  name: string;
  groupPoints: number;
  knockoutPoints: number;
  bonusPoints: number;
  total: number;
  rank: number;
  correctResults: number;
  correctOutcomes: number;
}
```

---

## Matching: Tips mot API-resultater

### Gruppespill
Match tips mot resultater via `homeTeam + awayTeam + group`. API returnerer engelske lagnavn (`"Mexico"`, `"South Africa"`), men tips i Excel er på norsk (`"Mexico"`, `"Sør-Afrika"`). Implementer en **navnemap** i `utils/teamNames.ts`:

```typescript
export const TEAM_NAME_MAP: Record<string, string> = {
  'South Africa': 'Sør-Afrika',
  'South Korea': 'Sør-Korea',
  'Czech Republic': 'Tsjekkia',
  'Bosnia and Herzegovina': 'Bosnia-Hercegovina',
  'Switzerland': 'Sveits',
  // ... osv for alle 48 lag
};

export function normalizeTeamName(apiName: string): string {
  return TEAM_NAME_MAP[apiName] ?? apiName;
}
```

### Sluttspill
Match tips mot resultater via **`apiId`**. Admin-panelet lar deg knytte et deltaker-tips til en spesifikk kamp-ID fra API-et når du vet hvem som møtes.

---

## Admin-panel (`src/components/AdminPanel.tsx`)

Tilgjengelig via `?admin=true` i URL. Passord lagres i `localStorage`.

### Admin-funksjonalitet

**Tab 1 – Sluttspill-tips:**
- Velg runde (R32, R16, QF, SF, 3P, F)
- Hent kamper for runden fra API (live)
- For hver kamp: legg inn tips for alle deltakere
- Lagres i `localStorage` under `knockout_tips_drammen` / `knockout_tips_alles`

**Tab 2 – Krydderspørsmål-fasit:**
- Legg inn fasit for hvert spørsmål etter hvert som de avgjøres
- Lagres i `localStorage` under `bonus_answers_drammen` / `bonus_answers_alles`

**Tab 3 – Manuell refresh:**
- Tving henting av nye resultater fra API (nullstill cache)

---

## Poengberegning (`src/utils/scoring.ts`)

```typescript
import { GroupTip, KnockoutTip, MatchResult, Outcome } from '../types';

export function getOutcome(home: number, away: number): Outcome {
  if (home > away) return 'home';
  if (home === away) return 'draw';
  return 'away';
}

export function calcPoints(
  tipHome: number,
  tipAway: number,
  resultHome: number,
  resultAway: number
): number {
  if (tipHome === resultHome && tipAway === resultAway) return 3;
  if (getOutcome(tipHome, tipAway) === getOutcome(resultHome, resultAway)) return 1;
  return 0;
}
```

---

## Vercel-oppsett (to prosjekter fra ett repo)

### Steg 1 – Push repo til GitHub
```bash
git init && git add . && git commit -m "init"
gh repo create vm-tipping-2026 --public --source=. --push
```

### Steg 2 – Drammen-prosjekt
1. [vercel.com](https://vercel.com) → **Add New Project** → importer `vm-tipping-2026`
2. **Root Directory:** `apps/drammen`
3. **Environment Variables:** `FOOTBALL_API_KEY` = din nøkkel (server-side, brukt av `api/matches.js`).
   Valgfritt: `VITE_ADMIN_PASSWORD` = ditt admin-passord.
4. Prosjektnavn: `vm-drammen` → **Deploy**

### Steg 3 – Alles-prosjekt
1. **Add New Project** igjen (samme repo)
2. **Root Directory:** `apps/alles`
3. **Environment Variables:** `FOOTBALL_API_KEY` = din nøkkel (server-side, brukt av `api/matches.js`).
   Valgfritt: `VITE_ADMIN_PASSWORD` = ditt admin-passord.
4. Prosjektnavn: `vm-alles` → **Deploy**

Etter første deploy: `git push` trigger automatisk deploy av begge.

---

## Krydderspørsmål (17 spørsmål, begge grupper)

| Nr | Spørsmål | Poeng |
|----|----------|-------|
| 1 | Hvem vinner VM? | 5p |
| 2 | Hvem vinner Gullballen (beste spiller)? | 5p |
| 3 | Hvem vinner Gullstøvelen (toppscorer)? | 5p |
| 4 | Hvem vinner FIFA Young Player of the Tournament? | 3p |
| 5 | Hvor mange mål scores det totalt i VM? (nærmest vinner) | 2p |
| 6 | Hvilket tidspunkt scores det raskeste målet? (±15 sek.) | 2p |
| 7 | Nevn to lag som får rødt kort i løpet av VM. | 2p |
| 8 | Nevn to lag som scorer selvmål i løpet av VM. | 2p |
| 9 | I hvilken gruppe scores det flest mål? | 2p |
| 10 | Hvilket lag blir VMs dårligste? | 2p |
| 11 | Hvem dømmer finalen? | 4p |
| 12 | Hvilken øynasjon kommer lengst? | 2p |
| 13 | Hvem scorer flest mål av Cristiano Ronaldo og Lionel Messi? | 1p |
| 14 | Hvilket afrikanske land kommer lengst? | 2p |
| 15 | Nevn en kjendis som dør i løpet av VM. | 3p |
| 16 | Får alle tre Bodø/Glimt-spillerne spilletid i løpet av VM? | 1p |
| 17 | Hvor langt kommer Norge? | 2p |

**Drammen-tips:**

| Sp. | Erling | Rune | Håkon | Geir | Tore |
|-----|--------|------|-------|------|------|
| 1 | Frankrike | Spania | Frankrike | – | Frankrike |
| 2 | Mbappe | Yamal | Mbappe | – | Haaland |
| 3 | Mbappe | Mbappe | Kane | – | Bellingham |
| 4 | Yamal | Yamal | Yamal | – | Yamal |
| 5 | 241 | 168 | 335 | – | 299 |
| 6 | 00:00:35 | 00:00:52 | 00:03:26 | – | 00:02:30 |
| 7 | Nederland, Portugal | Marokko, Argentina | Irak, Iran | – | Tyrkia, Ecuador |
| 8 | Curacao, Kapp Verde | Brasil, England | Norge, USA | – | Sør-Afrika, Skottland |
| 9 | E | E | E | – | E |
| 10 | Curacao | Kapp Verde | Curacao | – | Haiti |
| 11 | Schärer | Marciniak | Marciniak | – | Nyberg |
| 12 | Japan | Australia | Japan | – | Japan |
| 13 | Messi | Messi | Messi | – | Messi |
| 14 | Marokko | Marokko | Marokko | – | Marokko |
| 15 | Prinsesse Astrid | Pave Frans | Thorbjørn Jagland | – | Clint Eastwood |
| 16 | Ja | Ja | Nei | – | Nei |
| 17 | Åttendelsfinale | Kvartfinale | Semifinale | – | Kvartfinale |

*Merk: Geir mangler svar på de fleste krydderspørsmål i original-Excel.*

---

## Milestones

### Milestone 1 – Prosjektoppsett
- [x] Initialiser to Vite + React + TypeScript + Tailwind-apper under `apps/`
- [x] Definer TypeScript-typer i `types.ts`
- [x] Sett opp `apiClient.ts` og verifiser at API-kallet fungerer med nøkkel (verifisert 2026-06-13: 104 kamper hentet)

### Milestone 2 – Datalag (gruppespill)
- [x] Implementer `participants.ts` for Drammen (alle 72 gruppespill-tips)
- [x] Implementer `participants.ts` for Alles (alle 72 × 25 tips)
- [x] Implementer `teamNames.ts` med norsk↔engelsk navnemap for alle 48 lag
- [x] Implementer `bonusQuestions.ts` med tips fra begge grupper

**Datalag-notater (2026-06-13):**
- Filene er **auto-generert** av `tools/generate_data.py` fra Excel-eksporterte CSV-er.
  Rediger ikke `participants.ts` / `teamNames.ts` / `bonusQuestions.ts` for hånd – kjør generatoren på nytt.
- **Datamodell:** krydder-svar per deltaker ligger på `Participant.bonusTips` (i `participants.ts`).
  `bonusQuestions.ts` er kun spørsmåls-katalogen (id, tekst, maxPoints, `answer: null` til fasit settes).
- `Participant.knockoutTips` er tom `[]` – fylles via admin senere (Milestone 5/7).
- Q7/Q8 (rødt kort / selvmål) lagres som `answer: string[]` (to lag). Øvrige som `string`.
- Krydder-svar er rå fritekst med skrivefeil (f.eks. «Curacao», «Marocco») – bevisst bevart siden de
  poengsettes manuelt av fasit-setter.
- Verifisert: alle 48 norske lagnavn i tipsene finnes i `TEAM_NAME_MAP`. Drammen 288 gruppetips
  (Geir tom), Alles 1800.

### Milestone 3 – API-integrasjon
- [x] Implementer `useMatches.ts` med henting + 5-minutters localStorage-cache
- [x] Verifiser matching av API-resultater mot gruppespill-tips via lagnavn
- [x] Test poengberegning mot noen kjente resultater

**Scoring-notater (2026-06-13):**
- `utils/scoring.ts`: `calcPoints`/`getOutcome` (kjerne), gruppespill-matching via
  `normalizeTeamName(home)|normalizeTeamName(away)|group`, sluttspill via `apiId`, og
  `computeStandings()` som gir rangert `ParticipantScore[]` (lik total deler plass).
- Krydderpoeng i `computeBonusPoints()` – beregnes kun når fasit (`answer`) er satt:
  q5 «nærmest» (hele feltet), q6 ±15 sek, q7/q8 1p per korrekt lag (maks 2), ellers eksakt match.
- `hooks/useMatches.ts` henter **alle** kamper (også kommende, til kamplisten); scoring filtrerer FINISHED.
- Regresjonstest: `tools/verify_scoring.ts` (kjør `npx tsx tools/verify_scoring.ts`). Verifisert mot
  kjente resultater – f.eks. Håkon 10p (3 eksakte + 1 utfall) av de 4 første kampene.

### Milestone 4 – UI: Leaderboard og kamper
- [x] `Leaderboard.tsx` – rangert tabell (total, gruppespill, sluttspill, bonus)
- [x] `MatchList.tsx` – kamper gruppert per runde, med tips og poeng
- [x] Fargekoding: grønn (3p) / gul (1p) / rød (0p)
- [x] "Sist oppdatert: [tid]" med manuell refresh-knapp

**UI-notater (2026-06-13):**
- `App.tsx`: mobile-first skall med faner (Tabell/Kamper) på mobil; desktop (lg) viser begge
  kolonner side om side (leaderboard sticky til venstre).
- `Leaderboard.tsx`: kompakt på mobil (rank/navn/sum + liten G·S·B-linje); gruppe-/sluttspill-/bonus-
  kolonner vises fra `md`.
- `MatchList.tsx` → `MatchRow.tsx`: kamper gruppert per runde (+ gruppe A–L). Hver kamprad er
  utvidbar og viser alle deltakeres tips fargekodet (grønn 3p / gul 1p / rød 0p / nøytral = ikke spilt).
- Kamper med ukjente lag (TBD i sluttspill) skjules til oppsettet er klart.
- `utils/labels.ts`: norske runde-/gruppenavn + dato/tid-formattering (`Intl`, `no-NO`).
- Verifisert mot live API-data: Drammen leder Håkon 10p; Alles Håkon M & Magnus delt 10p
  (uavgjort-rangering 1,1,3 fungerer).

### Milestone 5 – Admin-panel
- [x] `AdminPanel.tsx` bak `?admin=true` + passord
- [x] Tab for sluttspill-tips: velg runde → hent kamper fra API → legg inn tips
- [x] Tab for krydderspørsmål-fasit
- [x] Lagring i `localStorage`

**Admin-notater (2026-06-13):**
- Åpnes via `?admin=true`. Passord fra `VITE_ADMIN_PASSWORD` (standard `vm2026`). NB: ren klient-side
  gate – ikke ekte sikkerhet (alt ligger i localStorage uansett). Auth huskes i `<suffix>_admin_authed`.
- `utils/storage.ts`: leser/skriver `knockout_tips_<suffix>` (navn → KnockoutTip[]) og
  `bonus_answers_<suffix>` (questionId → fasit). `mergeKnockoutTips()` + `applyBonusAnswers()` fletter
  overstyringene inn i de statiske dataene før scoring – `App.tsx` holder dette i state.
- Sluttspill-tab henter kamper fra allerede-hentede `results` (filtrert på runde, kun kjente lag),
  ikke et eget API-kall. Hver kamp er utvidbar med 2-talls input per deltaker.
- Krydder-tab: ett felt per spørsmål (to felt for q7/q8). Tomt felt = ikke avgjort (`answer` forblir null).
- Oppdater-tab: tømmer resultat-cachen og kaller `refresh()`.

**Datadeling – «bake inn + redeploy» (valgt 2026-06-13):**
- localStorage er per nettleser, så admin-data deles IKKE automatisk med andre. Løsning: innbakte
  JSON-filer er den delte sannheten, localStorage er kun admin sin live-forhåndsvisning.
- `data/knockoutTips.json` (navn → KnockoutTip[]) og `data/bonusAnswers.json` (questionId → fasit).
  `App.tsx` fletter `{ ...innbakt, ...localStorage }` før scoring (localStorage vinner ved konflikt).
- **Arbeidsflyt per runde:** admin legger inn tips/fasit → «Lagre» (lokal forhåndsvisning) →
  «Eksporter JSON» (kopierer til utklippstavle) → lim inn i riktig `.json`-fil → `git push` →
  Vercel redeployer → synlig for alle. Gjøres i begge apper (drammen + alles) ved behov.
- Subtil admin-inngang: tannhjul-knapp i footeren (åpner `?admin=true` uten reload).

### Milestone 6 – Deploy
- [ ] Push til GitHub
- [ ] Opprett to Vercel-prosjekter med `FOOTBALL_API_KEY` (server-side)
- [ ] Verifiser begge URL-er fungerer

### Milestone 7 – Sluttspill-runder (løpende under VM)
Når en ny sluttspill-runde starter:
1. Samle inn tips fra deltakerne (WhatsApp e.l.)
2. Åpne admin-panel → legg inn tips for runden
3. Appen henter resultater automatisk fra API etter kampene er spilt

---

## Implementert (oppdatert 2026-06-14)

Utover Milestone 1–5 er følgende bygget og i drift lokalt. Begge apper er kodedelt – kun
`config.ts`, `data/participants.ts`, `data/*.json` og `public/teams` skiller dem (resten kopieres likt).

**Design / tema (offisielle VM 2026-farger, samplet fra brand-grafikken):**
- `index.css`: `@theme`-tokens (`--color-wc-red`, `-lime`, `-mint`, `-blue`, `-lavender` …), op-art-
  striper (`.wc-stripes`), knapp-stil (`.wc-btn`), og **fast** side-bakgrunn (`.wc-page::before`,
  `position: fixed` → står helt stille ved scroll, ingen parallaks-kvalme).
- Header: diagonale farger + mørkt slør for lesbar hvit tekst, hvit VM-logo (`public/wc-logo.png`,
  uttrukket og nedskalert fra PNG) + tittel «TIPPEKONK». Aktiv fane bruker stripe-stilen.
  Status viser kun klokkeslett. Subtilt tannhjul i footeren → admin.
- Body holdes rolig/mørk med hvit tekst. Poeng-fargekoding i **standard** grønn/gul/rød.

**Layout:** konsekvent mobil-stil på alle skjermer – tre faner (Tabell/Kamper/Krydder), én sentrert
kolonne (`max-w-2xl`). Ingen egen to-kolonne desktop-layout lenger (desktop = mobil, bare bredere).

**Leaderboard (`Leaderboard.tsx`):**
- Rad: `#  navn  plasserings-pil  grønn·gul·rød (midtstilt)  sum`. Identisk mobil/desktop.
- **Plasserings-pil** (`computeRankDeltas`): sammenligner nå-tabellen mot tabellen *før siste
  kampdag* (alle ferdige kamper med seneste UTC-dato = én pulje, så hele dagens runde – inkl.
  samtidige kamper – teller som én hendelse). ▲tall = opp, ▼tall = ned, – = uendret. Basert på
  **plassering** (delt plass deler tall), ikke rad-posisjon. Kun FINISHED-kamper teller (live påvirker
  ingenting). Merk: pila viser «dagens bevegelse» – nullstilles ved ny kampdag, ikke per enkeltkamp.
- **Trykk på navn** → `participantBreakdown`: viser hvor poengene kom fra. Kun poenggivende treff
  (kamper som kompakt `lag resultat lag +p`, krydder med svar). Bomtipp utelates.

**Kamper:**
- Kamprad + «Aktuell kamp»-kort: `logo  lag  stilling  lag  logo`. Stilling alltid sentrert; dato +
  klokkeslett (`14.06   21:00`) når kampen ikke har startet; rød prikk (rad) / «● LIVE» (kort) live.
  Klikkbar → alles tips (`TipChips`, delt komponent). «Aktuell kamp» blir også værende i runde-lista.
- Lag-logoer: `public/teams/<slug>.png` (256px transparente PNG). `teamLogos.ts` mapper norsk lagnavn
  → slug (= filnavn-prefiks fra football-logos.cc); `TeamLogo` faller elegant tilbake om logo mangler.

**Robusthet:** `reconcileResults` (i `useMatches`) sikrer at et allerede ferdig resultat aldri kan
«forsvinne» pga. en inkonsistent/forbigående API-respons.

**Data:** Tor Arne i Drammen (6 deltakere), Kajsa i Alles (26). Lag-/pokal-logoer er PNG, ikke SVG.

**Tester:** `tools/verify_scoring.ts` (`npx tsx`) dekker calcPoints, matching, krydder-regler,
storage-fletting, reconcile, breakdown og rank-deltas.

---

## Sluttspill: innhenting av tips (foretrukket arbeidsflyt)

Sluttspill-lagene er ukjente på forhånd, så tips samles inn runde for runde. Modellen er
**«bake inn i koden + redeploy»** (samme som gruppespill): de innbakte JSON-filene er den delte
sannheten, localStorage er kun admin sin live-forhåndsvisning. Tips matches mot resultat via **`apiId`**.

**Per runde (R32 → finale):**
1. Når runden er trukket dukker kampene opp automatisk fra API-et (TBD-kamper skjules til lagene er klare).
2. Samle inn tips fra deltakerne (WhatsApp e.l.).
3. Admin (`?admin=true`, passord `vm2026` / `VITE_ADMIN_PASSWORD`) → **Sluttspill**-fanen → velg runde
   → legg inn 2-talls tips per deltaker per kamp → **Lagre** (lokal forhåndsvisning).
4. **Eksporter JSON** → lim inn i `apps/<app>/src/data/knockoutTips.json` (gjøres per app).
5. `git push` → Vercel redeployer → synlig for alle.

Krydder-fasit settes på samme måte i **Krydder-fasit**-fanen → `bonusAnswers.json` (tomt felt = ikke avgjort).

**Alternativ (raskt):** send meg tipsene/fasiten, så baker jeg dem inn i JSON-filene direkte (slik vi
gjorde med deltaker-oppdateringen). **Nye/endrede deltakere:** bytt ut Excel-filene i `data/`, så
regenererer jeg `participants.ts` via `tools/generate_data.py` og verifiserer antall + lagnavn.

---

## Backlog (fremtid)

- **«Aktuell kamp» ved flere samtidige kamper.** I dag viser kortet KUN ÉN kamp (`pickFeatured` i
  `MatchList.tsx`: live nå → ellers neste kommende → ellers sist spilte). Når flere kamper spilles
  samtidig (typisk siste gruppekamp-runde, kl. 21:00-kampene; og bronse/finale-helg), bør det bli til
  **flere kort** – f.eks. en «Aktuelle kamper»-seksjon som viser ALLE som er live nå (eller alle i
  neste avsparkspulje hvis ingen er live ennå). Forslag: endre `pickFeatured()` til å returnere en
  liste (`MatchResult[]`): live-puljen hvis noen lever, ellers neste avsparkspulje, ellers `[]`; og
  render én `FeaturedMatch` per kamp. Komponentene støtter allerede dette (bare velg-logikken endres).
- **Favicon + app-ikon** fra VM-logoen (`index.html` + `public/`).
- (fyll inn flere ønsker her etter hvert)

---

## Viktige implementasjonsnotater

### Lagnavn norsk↔engelsk
API returnerer engelske navn. Tips er på norsk. Bygg komplett map i `teamNames.ts` for alle 48 lag før du starter matching.

### Sluttspill-matching
Bruk `apiId` (football-data.org sin kamp-ID) som nøkkel for sluttspill-tips. Admin-panelet henter kampene fra API og lar deg knytte tips til riktig kamp-ID.

### Geir i Drammen mangler svar
Behandle `undefined`/`null` tips som 0 poeng uten feilmelding.

### Krydderspørsmål – spesialregler
- **Sp. 5 (antall mål):** Nærmest fasit vinner. Ved likt: begge får poeng.
- **Sp. 6 (raskeste mål):** Innenfor ±15 sekunder fra fasit.
- **Sp. 7 & 8 (rødt kort / selvmål):** 1 poeng per korrekt nevnt lag (maks 2p).
- **Sp. 15 (kjendis):** Manuelt avgjort av fasit-setter.

### API-nøkkel i utvikling
Lag en `.env.local`-fil i hver app-mappe (ikke commit denne):
```
VITE_FOOTBALL_API_KEY=din_nøkkel_her
```

---

## Kommandoer

```bash
# Start Drammen-appen lokalt
cd apps/drammen && npm run dev

# Start Alles-appen lokalt
cd apps/alles && npm run dev

# Bygg for produksjon
npm run build

# Preview build
npm run preview
```

---

## Notater underveis (oppdater her)

### Sluttspill-tips mottatt
- [ ] Sekstendelsfinaler – tips ikke mottatt ennå
- [ ] Åttendelsfinaler – tips ikke mottatt ennå
- [ ] Kvartfinaler – tips ikke mottatt ennå
- [ ] Semifinaler – tips ikke mottatt ennå
- [ ] Bronsefinale/Finale – tips ikke mottatt ennå

### Krydderspørsmål-fasit avgjort
- Ingen avgjort ennå

### Kjente bugs / TODO
- **CORS løst (2026-06-13):** direkte nettleserkall til football-data.org blokkeres. Innført proxy
  (Vite dev-proxy + Vercel-funksjon `api/matches.js`). Klienten kaller `/api/matches`. Se CORS-seksjonen over.
- **Vercel-deploy:** husk å sette `FOOTBALL_API_KEY` (ikke `VITE_FOOTBALL_API_KEY`) i begge prosjektene.
- API bruker navnene `Czechia` og `Bosnia-Herzegovina` – ta høyde for dette i `teamNames.ts` (Milestone 2).
