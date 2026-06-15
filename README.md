# Tippekonk – Live VM-poengtavle 2026

Monorepo med to React-apper som viser en live poengtabell for **to vennegruppers** VM-tipping
(fotball-VM 2026). Kampresultater og live-stillinger hentes fra
[football-data.org](https://www.football-data.org/); sluttspill-tips og krydder-fasit legges inn via et
passordbeskyttet admin-panel og deles til alle via en delt database (Upstash KV).

Se [CLAUDE.md](./CLAUDE.md) for full arkitektur- og prosjektbeskrivelse.

## Funksjoner

- **Live poengtabell** – 3p eksakt resultat / 1p riktig utfall / 0p feil. Teller kun ferdigspilte
  kamper; lik total deler plass. Trykk på et navn for poeng-breakdown, og plasserings-piler viser
  bevegelse siden forrige kampdag.
- **Utviklingsgraf** – under-toggle `Stilling | Graf`: en lett egen SVG-linjegraf over hver deltakers
  kumulative poeng dag-for-dag (topp 3 default, togglebare spillere).
- **Kamper** – kommende (dato/klokke + kanal NRK/TV2), live (● LIVE + stilling) og ferdige. «Aktuelt»
  fremhever inntil 2 live/nærmeste kamper. Trykk på en kamp for å se **alles tips** og – for
  live/ferdige kamper – **målscorere + røde kort** på en tidslinje (minutt i midten, ⚽/🟥 på lagets
  side; deep data).
- **Krydder** – 17 spesialspørsmål med egne poeng- og spesialregler. Live-projeksjoner for q5 (antall
  mål) og q9 (gruppe med flest mål).
- **Stats** – sub-toggle `Lagstats | Spillerstats`: gruppetabeller (med markering av dårligste lag) +
  kort per lag, og toppscorer/assistkonge/råtass med posisjon og landlogo. Aggregeres fra deep data på
  tvers av alle kamper (inkl. live).
- **Admin-panel** (`?admin=true`) – legg inn sluttspill-tips, krydder-fasit (med dato per svar) og
  publiser til alle via den delte databasen. Passordbeskyttet server-side.

## Datakilde / API

football-data.org, plan **«Free + Deep Data»** (30 kall/min, live in-play-stillinger + per-kamp-detaljer).
Konkurranse-kode `WC`. Nøkkelen ligger **kun server-side** – klienten kaller alltid en proxy på samme
origin (Vercel-funksjon i prod, Vite dev-proxy lokalt):

| Klient-endepunkt        | Oppstrøm                       | Bruk                                   |
|-------------------------|--------------------------------|----------------------------------------|
| `/api/matches`          | `/v4/competitions/WC/matches`  | Alle kamper (bulk), polles hvert 10s   |
| `/api/matchdetail?id=`  | `/v4/matches/{id}`             | Deep data (mål/kort) for én kamp       |
| `/api/stats`            | `/v4/matches/{id}` (alle) + KV | Aggregert statistikk (mål/assist/kort) |
| `/api/state?app=`       | Upstash KV                     | Delt admin-data (GET offentlig / POST) |

Proxyene setter edge-cache (`s-maxage`) så mange brukere deler samme svar og holder seg trygt under
rategrensen. `goals` har `type: REGULAR|OWN|PENALTY`, `bookings` har `card: YELLOW|RED|YELLOW_RED`.

## Struktur

```
apps/
  drammen/   → app 1  (7 deltakere)
  alles/     → app 2  (26 deltakere)
```

Hver app er en frittstående Vite + React + TypeScript + Tailwind-app, deployet som sitt eget
Vercel-prosjekt. Appene er kodedelt – kun `config.ts`, `data/` og `public/teams` skiller dem; alle andre
filer holdes **identiske** og kopieres mellom appene ved endring.

## Komme i gang (lokalt)

```bash
cd apps/drammen                 # eller apps/alles
cp .env.example .env.local      # fyll inn FOOTBALL_API_KEY (se «Miljøvariabler»)
npm install
npm run dev
```

Du trenger en API-nøkkel fra [football-data.org](https://www.football-data.org/client/register) for at
kamper skal lastes. KV-nøklene (delt database) trengs kun hvis du også vil teste admin-lagring lokalt.

## Miljøvariabler

Lag en `.env.local` i hver app-mappe (commit den aldri):

```
FOOTBALL_API_KEY=din_nøkkel_her        # server-side (brukt av proxyene)
ADMIN_PASSWORD=ditt_admin_passord      # server-side (skriving til delt database)
VITE_ADMIN_PASSWORD=ditt_admin_passord # klient-gate (samme verdi)
KV_REST_API_URL=...                    # fra Upstash-storen (Vercel → Storage)
KV_REST_API_TOKEN=...
```

På Vercel injiseres KV-nøklene automatisk når Upstash-storen kobles til prosjektet; `FOOTBALL_API_KEY`,
`ADMIN_PASSWORD` og `VITE_ADMIN_PASSWORD` settes manuelt per prosjekt. Samme `FOOTBALL_API_KEY` brukes
av både `/api/matches` og `/api/matchdetail` – ingen ekstra variabel for deep data.

> ⚠️ Dette repoet er offentlig. `VITE_ADMIN_PASSWORD` har en dev-standard (`vm2026`) som dermed er
> allment kjent – sett et **eget** admin-passord i produksjon. Hemmeligheter (API-nøkkel, KV-token,
> admin-passord) ligger kun som miljøvariabler, aldri i koden.

## Kommandoer (per app)

| Kommando          | Beskrivelse                  |
|-------------------|------------------------------|
| `npm run dev`     | Start utviklingsserver       |
| `npm run build`   | Bygg for produksjon          |
| `npm run preview` | Forhåndsvis produksjonsbygg  |
| `npm run lint`    | Kjør ESLint                  |

Verktøy i `tools/` (kjøres fra repo-rot): `generate_data.py` (Excel → datalag) og
`verify_scoring.ts` (`npx tsx tools/verify_scoring.ts`, regresjonstester).

## Deploy (Vercel + Upstash KV)

Hver app deployes som sitt eget Vercel-prosjekt fra samme repo:

1. **Database:** opprett én Upstash Redis-store (Vercel → Storage). **Samme** store kobles til begge
   prosjektene – nøklene namespaces per app (`<suffix>:knockoutTips`, `<suffix>:bonusAnswers`), så de
   deler ikke data.
2. **Prosjekt:** «Add New Project» → importer repoet → sett **Root Directory** til `apps/drammen`.
   Gjenta med et eget prosjekt for `apps/alles`.
3. **Miljøvariabler** per prosjekt: `FOOTBALL_API_KEY`, `ADMIN_PASSWORD`, `VITE_ADMIN_PASSWORD`
   (samme verdi som `ADMIN_PASSWORD` – og *ikke* dev-standarden `vm2026`). KV-nøklene injiseres
   automatisk når storen kobles til prosjektet.
4. Deploy. Etter første deploy trigger hver `git push` automatisk redeploy av begge.

`api/matches.js` + `api/matchdetail.js` proxer football-data.org (nøkkel server-side), og `api/state.js`
leser/skriver den delte databasen. Full detalj i [CLAUDE.md](./CLAUDE.md) → «Deploy» og
«Datadeling: Upstash KV».

## Planlagt

- **Auto-krydder fra deep data:** utlede fasit + datoer automatisk for q7 (rødt kort), q8 (selvmål) og
  flere, med admin-overstyring.
- **Sluttspills-visning** for «Kamper»-fanen (bracket-følelse) når gruppespillet er over.
- Favicon/app-ikon fra VM-logoen; NRK/TV2-kanal for sluttspillsrundene.

Se [CLAUDE.md](./CLAUDE.md) → «Backlog» for detaljer.

## Om prosjektet

Et personlig hobbyprosjekt laget for to vennegruppers VM-tipping – ikke et generelt produkt. `data/`
inneholder deltakernes fornavn og tips. Koden deles under MIT-lisensen (se under) som
referanse/inspirasjon. Ikke tilknyttet football-data.org eller FIFA.

## Lisens

[MIT](./LICENSE) © 2026 Håkon M. Du står fritt til å bruke, endre og dele koden så lenge
copyright-/lisens-teksten følger med. (Deltakerdataene i `data/` er ikke ment for gjenbruk.)
