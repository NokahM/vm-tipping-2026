# VM Tipping 2026 – Live Poengtavle

Monorepo med to React-apper som viser live-poengtabell for to vennegjengers VM-tipping (fotball-VM 2026). Resultater hentes fra [football-data.org](https://www.football-data.org/).

Se [CLAUDE.md](./CLAUDE.md) for full prosjektbeskrivelse.

## Struktur

```
apps/
  drammen/   → vm-drammen.vercel.app   (5 deltakere)
  alles/     → vm-alles.vercel.app     (25 deltakere)
```

Hver app er en frittstående Vite + React + TypeScript + Tailwind-app.

## Komme i gang

```bash
# Drammen
cd apps/drammen
npm install
npm run dev

# Alles
cd apps/alles
npm install
npm run dev
```

## Miljøvariabler

Lag en `.env.local` i hver app-mappe (ikke commit denne):

```
VITE_FOOTBALL_API_KEY=din_nøkkel_her
```

## Kommandoer (per app)

| Kommando          | Beskrivelse                  |
|-------------------|------------------------------|
| `npm run dev`     | Start utviklingsserver       |
| `npm run build`   | Bygg for produksjon          |
| `npm run preview` | Forhåndsvis produksjonsbygg  |
| `npm run lint`    | Kjør ESLint                  |
