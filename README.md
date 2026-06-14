# Tippekonk – Live VM-poengtavle 2026

Monorepo med to React-apper som viser en live poengtabell for **to vennegruppers** VM-tipping
(fotball-VM 2026). Kampresultater og live-stillinger hentes fra
[football-data.org](https://www.football-data.org/); sluttspill-tips og krydder-fasit legges inn via et
passordbeskyttet admin-panel og deles til alle via en delt database (Upstash KV).

Se [CLAUDE.md](./CLAUDE.md) for full arkitektur- og prosjektbeskrivelse.

## Struktur

```
apps/
  drammen/   → app 1  (7 deltakere)
  alles/     → app 2  (26 deltakere)
```

Hver app er en frittstående Vite + React + TypeScript + Tailwind-app, deployet som sitt eget
Vercel-prosjekt. Appene er kodedelt – kun `config.ts`, `data/` og `public/teams` skiller dem.

## Komme i gang

```bash
cd apps/drammen        # eller apps/alles
npm install
npm run dev
```

## Miljøvariabler

Lag en `.env.local` i hver app-mappe (commit den aldri):

```
FOOTBALL_API_KEY=din_nøkkel_her        # server-side (brukt av proxyen)
ADMIN_PASSWORD=ditt_admin_passord      # server-side (skriving til delt database)
VITE_ADMIN_PASSWORD=ditt_admin_passord # klient-gate (samme verdi)
KV_REST_API_URL=...                    # fra Upstash-storen (Vercel → Storage)
KV_REST_API_TOKEN=...
```

På Vercel injiseres KV-nøklene automatisk når Upstash-storen kobles til prosjektet; `FOOTBALL_API_KEY`,
`ADMIN_PASSWORD` og `VITE_ADMIN_PASSWORD` settes manuelt per prosjekt.

## Kommandoer (per app)

| Kommando          | Beskrivelse                  |
|-------------------|------------------------------|
| `npm run dev`     | Start utviklingsserver       |
| `npm run build`   | Bygg for produksjon          |
| `npm run preview` | Forhåndsvis produksjonsbygg  |
| `npm run lint`    | Kjør ESLint                  |

Verktøy i `tools/` (kjøres fra repo-rot): `generate_data.py` (Excel → datalag) og
`verify_scoring.ts` (`npx tsx tools/verify_scoring.ts`, regresjonstester).
