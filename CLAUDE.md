# Tippekonk – Live VM-poengtavle 2026

## Prosjektoversikt

React-webapp som viser en live poengtabell for **to vennegruppers** VM-tipping (fotball-VM 2026).
Kampresultater og live-stillinger hentes automatisk fra **football-data.org**. Gruppespill-tips er
ferdiglastet; sluttspill-tips og krydder-fasit legges inn via et passordbeskyttet admin-panel og
deles til alle gjennom en delt database.

**Monorepo:** ett repo, **to separate apper** (kodesuffiks `drammen` og `alles`), to Vercel-prosjekter.
Den ene gruppen har 7 deltakere, den andre 26. Appene er **kodedelt** – kun `config.ts`,
`data/participants.ts`, `data/*.json` og `public/teams` skiller dem (resten kopieres likt mellom appene).
Ingen personnavn ligger i denne dokumentasjonen; deltakerdata bor i `participants.ts`.

---

## Poengsystem

**Kampresultater**
- **3 poeng** – riktig eksakt resultat (tip 2-1, fasit 2-1)
- **1 poeng** – riktig utfall (seier/uavgjort/tap riktig, men feil score)
- **0 poeng** – feil utfall

**Krydderspørsmål** (17 stk) – poeng varierer per spørsmål; fasit settes manuelt. Spesialregler under.

---

## Tech stack

- **Frontend:** React 19 + TypeScript 5.7 + Vite 6
- **Styling:** Tailwind CSS v4 (mobile-first, `@theme`-tokens)
- **Resultater:** football-data.org API via egen proxy (server-side nøkkel)
- **Delt admin-data:** Upstash Redis («Vercel KV»)
- **Deploy:** Vercel – to prosjekter fra ett repo

---

## Datakilde: football-data.org

**Betalt plan: «Free w/ Livescores» (€12/mnd)** → live in-play-stillinger + **20 kall/min**.
(Gratis-tier ga kun 10/min og **ingen pålitelig live-data** – kamper hang på `TIMED` uten stilling
til de var ferdige. Den betalte planen var nødvendig for at live-stillinger skal fungere.)
Begge apper deler **samme** API-nøkkel, så samlet forbruk teller mot 20/min.

- Konkurranse-kode: `WC`. Hovedendepunkt: `GET /v4/competitions/WC/matches`. Auth: `X-Auth-Token`.
- Statuser vi bruker: `SCHEDULED`/`TIMED` (kommende), `IN_PLAY`/`PAUSED` (live), `FINISHED`.
- Live: `score.fullTime` oppdateres løpende mens kampen spilles.
- **Stage-navn:** API-et bruker `LAST_32`/`LAST_16` for sekstendels-/åttendelsfinaler; `apiClient.ts`
  oversetter til `ROUND_OF_32`/`ROUND_OF_16` (som resten av koden bruker). Alle 104 kampene ligger i
  API-et fra start – sluttspill-kampene med **tomme lag (→ «TBD») + klokkeslett**, og fylles inn
  automatisk med lag/stilling per runde. Sluttspill-fanen viser TBD-slotene; gruppespill + «Aktuelt»
  filtrerer dem bort (`isKnown`) til lagene er klare.

### CORS → proxy er nødvendig
football-data.org svarer ikke med en brukbar CORS-header, så direkte nettleserkall blokkeres.
Løsning – proxy på **samme origin**:
- **Prod:** serverless-funksjon `api/matches.js` legger på nøkkelen server-side og videresender.
- **Dev:** Vite dev-proxy i `vite.config.ts` gjør det samme.
- Klienten kaller alltid `/api/matches?status=…&stage=…`. **Nøkkelen havner aldri i klient-bundelen.**
- **Miljøvariabel:** `FOOTBALL_API_KEY` (server-side). Proxy + funksjon leser også `VITE_FOOTBALL_API_KEY`
  som fallback.

### Ferskhet & rategrense (edge-cache + polling)
- `api/matches.js` setter `Cache-Control: s-maxage=8, stale-while-revalidate=60`. Vercels edge cacher
  responsen i 8 s, så **alle brukere deler samme cachede svar** – uansett antall brukere blir det kun
  ~1 oppstrømskall per 8 s **per app** (~15/min for begge apper samlet, trygt under 20/min).
- Klienten (`useMatches`) poller hvert **10. sekund** mens fanen er synlig, og umiddelbart når brukeren
  kommer tilbake til fanen. Polling treffer edge-cachen, så den belaster **ikke** rategrensen mot
  football-data.org – kun Vercel «Edge Requests» (verdt et blikk i Usage-fanen under tunge kampkvelder;
  enkelt å skru ned poll-intervallet hvis det klatrer).
- Å senke `s-maxage` gir ferskere data uten å øke edge-requests (det påvirker kun oppstrømskall).
- **Forsinkelse i dag:** ~8 s edge + ~10 s poll ≈ inntil ~18 s på toppen av kildens egen (nå korte)
  live-lag.
- `reconcileResults` (i `useMatches`) sørger for at et allerede ferdig resultat aldri kan «forsvinne»
  pga. et inkonsistent/forbigående API-svar.

---

## Design: mobile-first

Siden brukes primært på mobil. **Desktop = mobil, bare bredere** (én sentrert kolonne, `max-w-2xl` –
ingen egen to-kolonne-layout).
- Mobilvisning (< 640px) er primærmålet: lett å lese med én hånd.
- Touch-vennlig: interaktive elementer ≥ 44×44px, ingen hover-only.
- Ingen horisontal scroll. Minimal bundle.
- Tailwind: start mobilt, utvid med breakpoints (`text-sm md:text-base`), ikke override nedover.

---

## Monorepo-struktur

```
tippekonk/                          # repo-root
├── apps/
│   ├── drammen/                    # app 1 (Vercel-prosjekt 1)
│   │   ├── api/
│   │   │   ├── matches.js          # proxy mot football-data.org (server-side nøkkel)
│   │   │   └── state.js            # delt admin-data (Upstash KV): GET offentlig / POST m/passord
│   │   ├── src/
│   │   │   ├── components/         # Leaderboard, MatchList, MatchRow, FeaturedMatch,
│   │   │   │                       # TipChips, BonusQuestions, AdminPanel, TeamLogo, BroadcasterBadge
│   │   │   ├── data/
│   │   │   │   ├── participants.ts     # gruppespill- + krydder-tips per deltaker (auto-generert)
│   │   │   │   ├── bonusQuestions.ts    # de 17 krydderspørsmålene (auto-generert)
│   │   │   │   ├── knockoutTips.json    # innbakt sluttspill-tips (fallback for KV)
│   │   │   │   ├── bonusAnswers.json    # innbakt krydder-fasit (fallback for KV)
│   │   │   │   └── broadcasters.json    # apiId → "NRK" | "TV2"
│   │   │   ├── hooks/useMatches.ts      # henter/cacher resultater, polling, reconcile
│   │   │   ├── utils/                   # scoring, teamNames, teamLogos, storage,
│   │   │   │                            # remoteStore, reconcile, labels, broadcasters, apiClient
│   │   │   ├── config.ts                # app-spesifikk (groupName, storageSuffix) – SKILLER appene
│   │   │   ├── types.ts
│   │   │   └── App.tsx
│   │   ├── public/teams/<slug>.png      # lag-logoer (256px PNG)
│   │   └── vite.config.ts               # dev-proxy for /api/matches + /api/state
│   └── alles/                       # app 2 (identisk kode, annen config.ts/data)
├── data/                           # kilde-Excel-filer (input til generatoren)
├── tools/
│   ├── generate_data.py            # Excel-CSV → participants.ts / teamNames.ts / bonusQuestions.ts
│   ├── add_late_joiner.py*         # fletter inn en sen enkeltdeltaker (se «Datapipeline»)
│   └── verify_scoring.ts           # regresjonstester (npx tsx)
├── CLAUDE.md
└── README.md
```
*Filnavn kan variere; det finnes et lite script for sene deltakere som leverer eget skjema.

---

## Datamodell (`src/types.ts`)

- `MatchResult` – `apiId, stage, group?, homeTeam, awayTeam, homeGoals, awayGoals, status, utcDate`.
  (`homeGoals/awayGoals` kan i praksis være `null` før/under kamp selv om typen sier `number`.)
- `Participant` – `name, groupTips[], bonusTips[], knockoutTips[]`.
- `GroupTip` (matches via lagnavn+gruppe), `KnockoutTip` (matches via `apiId`).
- `BonusTip` – `questionId, answer: string | string[]` (array for q7/q8 og andre liste-svar).
- `BonusQuestion` – `id, question, maxPoints, answer: string | string[] | null` (null = ikke avgjort).
- `ParticipantScore` – `name, groupPoints, knockoutPoints, bonusPoints, total, rank,
  correctResults, correctOutcomes, wrongOutcomes`.

---

## Matching: tips mot API-resultater

- **Gruppespill:** match via `normalizeTeamName(home)|normalizeTeamName(away)|group`. API gir engelske
  lagnavn, tips er på norsk → `utils/teamNames.ts` (`TEAM_NAME_MAP`, alle 48 lag). Bygg/vedlikehold
  denne komplett før matching.
- **Sluttspill:** match via **`apiId`** (admin knytter tips til kampen når lagene er kjent).

---

## Poengberegning (`src/utils/scoring.ts`)

- `calcPoints(tipH, tipA, resH, resA)` → 3 (eksakt) / 1 (utfall) / 0.
- `computeStandings(participants, results, questions)` → rangert `ParticipantScore[]`. **Teller kun
  `FINISHED`-kamper** (live påvirker ikke tabellen). Lik total deler plass (1, 2, 2, 4 …).
- `displayPointsForTip(tip, match)` → **foreløpige** poeng også for pågående kamper. Brukes **kun** til
  visuell fargekoding i kamp-tips (TipChips) – aldri til tabellen.
- `participantBreakdown(...)` → hvor en deltakers poeng kom fra (kun poenggivende treff). Trykk på navn
  i tabellen.
- `computeRankDeltas(...)` → plasserings-pil (opp/ned/uendret) siden forrige runde. En «runde» avgrenses
  ved **10:00 UTC / 12:00 norsk sommertid** (`matchDayKey()` forskyver 10 t tilbake før datoen tas), midt
  i det daglige kampfrie vinduet – slik at hele rundens kamper (også de som krysser midnatt i Nord-Amerika,
  og samtidige kamper) teller som én hendelse. Kun `FINISHED` teller.
- **«Live nå»-logikk (UI):** en kamp regnes som live når status er `IN_PLAY`/`PAUSED`, **eller** avspark
  har passert og kampen ikke er `FINISHED` (API-et henger noen ganger etter med statusflipp). Da vises
  rød prikk / «● LIVE» selv før status er oppdatert; stilling vises først når API-et faktisk har en score.

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
| 7 | Nevn to lag som får rødt kort i løpet av VM. | 4p (2p per lag) |
| 8 | Nevn to lag som scorer selvmål i løpet av VM. | 4p (2p per lag) |
| 9 | I hvilken gruppe scores det flest mål? | 2p |
| 10 | Hvilket lag blir VMs dårligste? | 2p |
| 11 | Hvem dømmer finalen? | 4p |
| 12 | Hvilken øynasjon kommer lengst? | 2p |
| 13 | Hvem scorer flest mål av Ronaldo og Messi? | 1p |
| 14 | Hvilket afrikanske land kommer lengst? | 2p |
| 15 | Nevn en kjendis som dør i løpet av VM. | 3p |
| 16 | Får alle tre Bodø/Glimt-spillerne spilletid i VM? | 1p |
| 17 | Hvor langt kommer Norge? | 2p |

**Spesialregler (`scoreBonusQuestion`):**
- **q5 (antall mål totalt):** full pott hvis tippet er innenfor **±5 mål** av fasit (`GOAL_MARGIN`).
  Krydder-fanen viser også en **live-projeksjon** av totalen (`projectTotalGoals`, mål-per-kamp så
  langt × 104, inkl. live) og fargekoder tippene grønt/rødt ±5 mot projeksjonen (kun visuelt).
- **q6 (raskeste mål):** innenfor ±15 sekunder fra fasit (parses som mm:ss / hh:mm:ss).
- **q7 / q8 (rødt kort / selvmål):** **2p per korrekt nevnt lag, maks 4p** (`maxPoints: 4`, deltaker
  nevner 2 lag). Styres av `PER_TEAM_IDS`. Fasit settes som komma-separert liste over **alle** lag som
  gjorde det.
- **q15 (kjendis):** fasit er en komma-separert liste (flere kan dø). Deltakeren nevner én → **full pott**
  hvis den er i lista («medlemskap», ikke per-element).
- Øvrige: eksakt tekstmatch (case-insensitiv).
- Poeng beregnes kun når `answer` er satt (ellers 0 for alle).
- Krydder-svar lagres som **rå fritekst** (skrivefeil bevisst bevart) siden de poengsettes/justeres manuelt.

---

## Admin-panel (`src/components/AdminPanel.tsx`)

Åpnes via `?admin=true` (eller det subtile tannhjul-ikonet i headeren). Tre faner: **Sluttspill**,
**Krydder**, **Oppdater**.

- **Passord-gate:** klient-side via `VITE_ADMIN_PASSWORD` (standard `vm2026`) – kun UI-skjul. Den **ekte**
  låsen er server-side: skriving til databasen krever `ADMIN_PASSWORD`. Sett **begge til samme verdi**.
  Passordet huskes i `<suffix>_admin_pw` (localStorage) så lagring virker etter reload.
- **Sluttspill-fanen:** velg runde (nedtrekksmeny) → kampene hentes fra allerede-lastede `results`
  (filtrert på runde, kun kjente lag) → 2-talls tips per deltaker per kamp.
- **Krydder-fanen:** ett felt per spørsmål. Liste-svar (q7/q8/q15) tas som komma-separert liste.
- **Oppdater-fanen:** tøm resultat-cache og hent på nytt (begrenset nytte – edge-cache + kildelag styrer
  ferskheten uansett).
- **«Lagre & publiser»:** skriver rett til den delte databasen → synlig for alle på sekunder (status:
  Publiserer… → Publisert ✓ / feil). **«Backup JSON»:** kopierer en snapshot til utklippstavla som
  valgfri, git-versjonert sikkerhetskopi.

### Datadeling: Upstash KV («Vercel KV»)
Admin-ansvaret kan delegeres til en person uten git-tilgang – derfor en delt database i stedet for
«rediger kode + redeploy».
- **Én delt Upstash Redis-store**, nøkler namespacet per app: `<suffix>:knockoutTips`,
  `<suffix>:bonusAnswers`.
- **`api/state.js`** (serverless, begge apper): `GET ?app=<suffix>` leser (offentlig, kort edge-cache);
  `POST ?app=<suffix>` skriver (krever `ADMIN_PASSWORD`). Bruker Upstash REST API via `fetch` – ingen
  npm-avhengighet. Leser `KV_REST_API_URL/TOKEN` (eller `UPSTASH_REDIS_REST_URL/TOKEN`).
- **`vite.config.ts`** speiler `/api/state` lokalt (`kvStatePlugin`) så `npm run dev` virker fullt ut
  (leser KV-nøkler + `ADMIN_PASSWORD` fra `.env.local`).
- **Klient (`utils/remoteStore.ts`):** `fetchRemoteState()` (GET) + `saveRemoteState(pw, partial)` (POST).
  `App.tsx` henter KV ved oppstart + ved `visibilitychange`, cacher i localStorage, og fletter
  `{ ...innbakt JSON, ...KV }` før scoring. **Innbakt JSON = fallback hvis KV er tom.**

---

## UI-oversikt

- **Tema:** offisielle VM 2026-farger. `index.css` har `@theme`-tokens (`--color-wc-red`, `-lime`,
  `-mint`, `-blue`, `-lavender` …), op-art-striper (`.wc-stripes`), knapp-stil (`.wc-btn`) og en **fast**
  side-bakgrunn (`.wc-page::before`, `position: fixed` – står stille ved scroll). Body er rolig/mørk med
  hvit tekst; poeng-fargekoding i standard grønn/gul/rød.
- **Header:** diagonale farger + mørkt slør, hvit VM-logo + tittel «Tippekonk». «Oppdatert hh:mm» +
  et **subtilt, gjennomsiktig tannhjul** (→ admin). Ingen offentlig refresh-knapp (auto-polling dekker
  det); manuell refresh ligger i admin.
- **Faner:** tre (Tabell / Kamper / Krydder), én sentrert kolonne.
- **Leaderboard:** kompakte rader `#  navn  plasserings-pil  grønn·gul·rød  sum`. Trykk på navn →
  poengbreakdown.
- **Kamper:** kamprad + «Aktuelt»-seksjon (inntil **2** kamper i én rød-kantet boks med delelinje;
  styres av `FEATURED_LIMIT` i `MatchList.tsx`). Format: `logo  lag  stilling  lag  logo`; dato+klokke
  før avspark, rød prikk / «● LIVE» under kamp. Klikkbar → alle tips (`TipChips`), fargekodet – og
  **foreløpig fargekoding mens kampen pågår** (`~Xp` + «● Foreløpige poeng»-hint).
- **Lag-logoer:** `public/teams/<slug>.png`; `teamLogos.ts` mapper norsk lagnavn → slug; `TeamLogo`
  faller elegant tilbake om logo mangler.
- **Kanal-merke:** `BroadcasterBadge` viser NRK/TV2 etter klokke/LIVE, fra innbakt `broadcasters.json`
  (gruppespillet fylt; sluttspill fylles per runde). Ikke vist på ferdigspilte kamper.

---

## Datapipeline (Excel → kode)

`participants.ts`, `teamNames.ts` og `bonusQuestions.ts` er **auto-generert** av `tools/generate_data.py`
fra Excel-eksporterte CSV-er (`data/*.xlsx`). **Rediger dem ikke for hånd – kjør generatoren på nytt.**
- Datamodell: krydder-svar per deltaker ligger på `Participant.bonusTips`; `bonusQuestions.ts` er kun
  spørsmåls-katalogen (fasit `null` til den settes via admin).
- q7/q8 overstyres til `maxPoints: 4` i generatoren.
- **Tomme svar:** noen deltakere har tomme felter (manglende tips/krydder) – behandles som 0 poeng uten
  feil (`undefined`/`null` → 0).
- **Sen deltaker:** dersom én deltaker kommer til etter at de andre er generert og leverer et eget
  enkeltmann-skjema, finnes et lite merge-script i `tools/` som leser skjemaet, validerer kampene mot det
  kanoniske settet i `participants.ts`, og legger deltakeren til. Allerede spilte kamper står blanke (kunne
  ikke tippes i ettertid), og rotete krydder-svar tolkes manuelt i scriptet. **Ved full regenerering: kjør
  merge-scriptet på nytt etterpå.**

---

## Tester

`tools/verify_scoring.ts` (kjør `npx tsx tools/verify_scoring.ts`) dekker: `calcPoints`,
`normalizeTeamName`, gruppespill-matching, alle krydder-regler (q5/q6/q7/q8/q15), storage-fletting,
`reconcileResults`, `participantBreakdown`, `computeRankDeltas` (inkl. midnatt-kryssing) og
`displayPointsForTip`. Kjør den etter endringer i scoring/data.

---

## Deploy (Vercel: to prosjekter fra ett repo)

For hvert prosjekt (`apps/drammen` og `apps/alles` som **Root Directory**):
1. **Add New Project** → importer repoet → sett Root Directory.
2. **Environment Variables:**
   - `FOOTBALL_API_KEY` – server-side nøkkel (brukt av `api/matches.js`).
   - `ADMIN_PASSWORD` – server-side admin-passord (delt med admin-ansvarlig).
   - `VITE_ADMIN_PASSWORD` – **samme verdi** (klient-gate).
   - KV-nøkler (`KV_REST_API_URL/TOKEN`) – **injiseres automatisk** når Upstash-storen kobles til
     prosjektet via Vercel → Storage (samme store kobles til begge prosjekter).
3. Deploy. Etter første deploy trigger `git push` automatisk redeploy av begge.

**Lokalt:** `.env.local` i hver app-mappe (commit aldri): `FOOTBALL_API_KEY`, `ADMIN_PASSWORD`,
`VITE_ADMIN_PASSWORD`, og KV-nøklene (hentes fra Upstash-storen / `vercel env pull`).

---

## Arbeidsflyt under VM

**Sluttspill per runde (R32 → finale):**
1. Når runden trekkes dukker kampene opp automatisk fra API-et (TBD-kamper skjules til lagene er klare).
2. Samle inn tips fra deltakerne.
3. Admin → **Sluttspill**-fanen → velg runde → legg inn 2-talls tips per deltaker → **Lagre & publiser**
   (skriver til KV → live for alle). Gjøres per app.
4. Krydder-fasit settes på samme måte i **Krydder**-fanen etter hvert som spørsmål avgjøres.

Sluttspill-tips matches mot resultat via `apiId`. «Backup JSON» kan limes inn i `knockoutTips.json` /
`bonusAnswers.json` som git-versjonert sikkerhetskopi ved behov.

---

## Backlog (fremtid)

- **Sluttspills-visning for «Kamper»-fanen:** når gruppespillet er over, skal «Kamper» føre rett til
  sluttspill-kampene (R32 → finale), ikke gruppespillet – presentert visuelt tilfredsstillende
  (bracket-følelse / runde-seksjoner med tydelig hierarki, gruppespillet skjøvet ned). Handler om
  rekkefølge/standardvisning + design, ikke ny data. Mobil-først (fullt bracket-tre er krevende på smal
  skjerm – vurder horisontal scroll per runde, eller kort).
- **Utvide «Aktuelt» til 3–4 kamper:** `FEATURED_LIMIT` er en ett-linjes endring, men tenk på visuell
  tetthet på mobil (mer kompakte rader, eller kun så mange som faktisk er live samtidig).
- **Favicon + app-ikon** fra VM-logoen.
- **Kanal (NRK/TV2) for sluttspill:** fyll `broadcasters.json` per runde (gruppespillet er allerede fylt).

---

## Kommandoer

```bash
# Start en app lokalt (dev)
cd apps/drammen && npm run dev      # eller apps/alles

# Bygg / preview / lint
npm run build
npm run preview
npm run lint

# Regenerer datalag fra Excel (kjør fra repo-rot)
py tools/generate_data.py <csvdir>

# Regresjonstester
npx tsx tools/verify_scoring.ts
```

> **Kodedeling:** når en delt fil endres (alt utenom `config.ts`, `data/*`, `public/teams`), kopiér den
> fra `apps/drammen` til `apps/alles` (eller motsatt) så begge appene holder seg like. Bygg begge og kjør
> testene før commit.
