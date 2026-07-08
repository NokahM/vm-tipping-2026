// Vercel serverless-funksjon: aggregerer deep data (mål/assist/kort + posisjon) på tvers av
// alle relevante kamper (FINISHED + live), og cacher per-kamp-uttrekket i KV. Ferdige kamper
// hentes kun én gang; live-kamper re-hentes når `lastUpdated` endres → topplistene oppdateres live.
//
// Selv-inneholdt (ingen lokale imports) så den samme handleren kan kalles fra Vite-dev-proxyen.

const CACHE_KEY = 'stats:v6'; // v6: `played` lagrer tidligste kampdag per spiller (q16-datering)
const BATCH = 10; // maks antall kamp-detaljer å hente per kall (skåner rategrensen)
const LIVE = ['FINISHED', 'IN_PLAY', 'PAUSED'];
const MATCHDAY_BOUNDARY_MS = 10 * 60 * 60 * 1000; // 10:00 UTC = 12:00 norsk – samme som matchDayKey

// Noon-ISO for kampens «matchday» (samme 12:00-grense som resten av appen). Brukt som
// dato et lag «fikk rødt kort / scoret selvmål» i auto-krydder.
function matchDayIso(utcDate) {
  if (!utcDate) return null;
  const day = new Date(Date.parse(utcDate) - MATCHDAY_BOUNDARY_MS).toISOString().slice(0, 10);
  return `${day}T12:00:00.000Z`;
}

let memCache = null; // fallback hvis KV mangler (lever per varm funksjons-instans)

function send(res, code, obj, cacheControl) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cacheControl) res.setHeader('Cache-Control', cacheControl);
  res.end(JSON.stringify(obj));
}

async function kvCmd(url, token, cmd) {
  if (!url || !token) return null;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d.result;
}

/** Trekker ut det vi trenger fra en kamp-detalj (kompakt). */
function extractMatch(d) {
  const goals = (d.goals || []).map((g) => ({
    id: g.scorer?.id ?? null,
    name: g.scorer?.name ?? '',
    team: g.team?.name ?? '',
    type: g.type || 'REGULAR',
    minute: g.minute ?? null,
    injuryTime: g.injuryTime ?? null, // overtid (90+N lagres som minute:90 + injuryTime:N)
    assistId: g.assist?.id ?? null,
    assistName: g.assist?.name ?? '',
  }));
  const bookings = (d.bookings || []).map((b) => ({
    id: b.player?.id ?? null,
    name: b.player?.name ?? '',
    team: b.team?.name ?? '',
    card: b.card || 'YELLOW',
  }));
  const refs = d.referees || [];
  const referee = (refs.find((r) => r.type === 'REFEREE') || refs[0])?.name || null;
  return { lastUpdated: d.lastUpdated, utcDate: d.utcDate, stage: d.stage, referee, goals, bookings };
}

/**
 * Spillere som faktisk fikk spilletid: startellever (lineup) + innbyttere (substitutions).
 * Verdien er spillerens TIDLIGSTE kampdag (noon-ISO) – brukes til å datere q16 (Bodø/Glimt-
 * spilletid) til kampen der den siste av de tre debuterte. Eldre cache kan ha `true` (uten dato);
 * vi oppgraderer til ISO når vi ser kampen igjen, og beholder alltid den minste datoen.
 */
function collectPlayed(d, played) {
  const iso = matchDayIso(d.utcDate);
  const mark = (id) => {
    if (id == null) return;
    const prev = played[id];
    if (!iso) {
      if (prev == null) played[id] = true; // ingen dato tilgjengelig – marker kun tilstedeværelse
    } else if (prev == null || prev === true || iso < prev) {
      played[id] = iso;
    }
  };
  for (const t of [d.homeTeam, d.awayTeam]) {
    for (const p of t?.lineup || []) mark(p?.id);
  }
  for (const s of d.substitutions || []) mark(s?.playerIn?.id);
}

/**
 * Auto-krydder fra deep data (akkumulerende, alltid korrekt):
 * q7 = lag med rødt kort (RED/YELLOW_RED), q8 = lag som scoret selvmål (goal.team for OWN).
 * Verdien er tidligste matchday-dato (noon-ISO) laget gjorde det → mater grafen per lag.
 * Engelske lagnavn; klienten normaliserer til norsk før fletting.
 */
function autoBonusFrom(cache) {
  const q7 = {};
  const q8 = {};
  const earliest = (map, team, iso) => {
    if (team && iso && (!map[team] || iso < map[team])) map[team] = iso;
  };
  for (const m of Object.values(cache.matches)) {
    const iso = matchDayIso(m.utcDate);
    for (const b of m.bookings) {
      if (b.card === 'RED' || b.card === 'YELLOW_RED') earliest(q7, b.team, iso);
    }
    for (const g of m.goals) {
      if (g.type === 'OWN') earliest(q8, g.team, iso);
    }
  }
  return { q7, q8 };
}

/** Bygger spiller-id → posisjon fra oppstilling + benk (stabil per spiller). */
function collectPositions(d, positions) {
  for (const t of [d.homeTeam, d.awayTeam]) {
    for (const p of [...(t?.lineup || []), ...(t?.bench || [])]) {
      if (p?.id != null && p.position) positions[p.id] = p.position;
    }
  }
}

const TOP_N = 15;

// Topp N (sortert synkende), men ta med alle som ligger LIKT med den N-te, så ingen kuttes
// midt i et likt-tall. `keyOf` returnerer verdien likhet måles på (mål / assist / kort).
function topWithTies(sorted, keyOf) {
  if (sorted.length <= TOP_N) return sorted;
  const cutoff = keyOf(sorted[TOP_N - 1]);
  let end = TOP_N;
  while (end < sorted.length && keyOf(sorted[end]) === cutoff) end++;
  return sorted.slice(0, end);
}

function aggregate(cache) {
  const scorers = new Map();
  const assists = new Map();
  const cards = new Map();
  const teamCards = new Map();

  for (const m of Object.values(cache.matches)) {
    for (const g of m.goals) {
      if (g.type !== 'OWN' && g.id != null) {
        const s = scorers.get(g.id) || { id: g.id, name: g.name, team: g.team, goals: 0 };
        s.goals++;
        s.name = g.name;
        s.team = g.team;
        scorers.set(g.id, s);
      }
      if (g.assistId != null) {
        const a = assists.get(g.assistId) || {
          id: g.assistId,
          name: g.assistName,
          team: g.team,
          assists: 0,
        };
        a.assists++;
        a.name = g.assistName;
        a.team = g.team;
        assists.set(g.assistId, a);
      }
    }
    for (const b of m.bookings) {
      if (b.id != null) {
        const c = cards.get(b.id) || { id: b.id, name: b.name, team: b.team, yellow: 0, red: 0 };
        if (b.card === 'YELLOW') c.yellow++;
        else c.red++; // RED + YELLOW_RED teller som rødt
        c.name = b.name;
        c.team = b.team;
        cards.set(b.id, c);
      }
      if (b.team) {
        const tc = teamCards.get(b.team) || { team: b.team, yellow: 0, red: 0 };
        if (b.card === 'YELLOW') tc.yellow++;
        else tc.red++;
        teamCards.set(b.team, tc);
      }
    }
  }

  const pos = cache.positions || {};
  const withPos = (x) => ({ ...x, position: pos[x.id] || '' });
  const goalsByPlayer = {};
  for (const s of scorers.values()) goalsByPlayer[s.id] = s.goals;
  return {
    goalsByPlayer, // id → antall mål (ekskl. selvmål), for q13 (Ronaldo/Messi)
    topScorers: topWithTies(
      [...scorers.values()].map(withPos).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)),
      (p) => p.goals,
    ),
    topAssists: topWithTies(
      [...assists.values()].map(withPos).sort((a, b) => b.assists - a.assists || a.name.localeCompare(b.name)),
      (p) => p.assists,
    ),
    topCards: topWithTies(
      [...cards.values()]
        .map(withPos)
        .sort((a, b) => b.red - a.red || b.yellow - a.yellow || a.name.localeCompare(b.name)),
      (p) => `${p.red}|${p.yellow}`,
    ),
    teamCards: topWithTies(
      [...teamCards.values()].sort(
        (a, b) => b.red - a.red || b.yellow - a.yellow || a.team.localeCompare(b.team),
      ),
      (t) => `${t.red}|${t.yellow}`,
    ),
  };
}

async function computeStats(apiKey, kvUrl, kvToken) {
  const auth = (url) => fetch(url, { headers: { 'X-Auth-Token': apiKey } });

  const bulkRes = await auth('https://api.football-data.org/v4/competitions/WC/matches');
  if (!bulkRes.ok) throw new Error(`Bulk-liste svarte ${bulkRes.status}`);
  const bulk = await bulkRes.json();
  const matches = bulk.matches || [];

  const raw = await kvCmd(kvUrl, kvToken, ['GET', CACHE_KEY]);
  const cache = raw ? JSON.parse(raw) : memCache || { matches: {}, positions: {}, played: {} };
  if (!cache.matches) cache.matches = {};
  if (!cache.positions) cache.positions = {};
  if (!cache.played) cache.played = {};

  const relevant = matches.filter((m) => LIVE.includes(m.status));
  const stale = relevant.filter((m) => {
    const c = cache.matches[m.id];
    return !c || c.lastUpdated !== m.lastUpdated;
  });

  for (const m of stale.slice(0, BATCH)) {
    try {
      const dRes = await auth(`https://api.football-data.org/v4/matches/${m.id}`);
      if (!dRes.ok) continue;
      const d = await dRes.json();
      cache.matches[m.id] = extractMatch(d);
      collectPositions(d, cache.positions);
      collectPlayed(d, cache.played);
    } catch {
      /* hopp over kampen denne runden */
    }
  }

  memCache = cache;
  if (kvUrl && kvToken) await kvCmd(kvUrl, kvToken, ['SET', CACHE_KEY, JSON.stringify(cache)]);

  const finalMatch = Object.values(cache.matches).find((m) => m.stage === 'FINAL');
  // q6: raskeste mål så langt (lavest minutt). Sekunder finnes ikke i API-et – kun pekepinn.
  // + mål-fordeling per 15-min-bolk (1-15, 16-30, 31-45, 46-60, 61-75, 76-90, 90+) for «Nerding».
  let fastestGoal = null;
  // Alle mål på det laveste minuttet – API-et har ikke sekunder, så flere kan være «raskest».
  let fastestGoals = [];
  const goalMinutes = [0, 0, 0, 0, 0, 0, 0];
  for (const m of Object.values(cache.matches)) {
    for (const g of m.goals || []) {
      if (g.minute == null) continue;
      const entry = { minute: g.minute, scorer: g.name, team: g.team };
      if (!fastestGoal || g.minute < fastestGoal.minute) {
        fastestGoal = entry;
        fastestGoals = [entry];
      } else if (g.minute === fastestGoal.minute) {
        fastestGoals.push(entry);
      }
      const mn = g.minute;
      // Andre-omgangs overtid (90+N) lagres som minute:90 + injuryTime → egen «90+»-bolk.
      const stoppage90 = mn > 90 || (mn === 90 && (g.injuryTime || 0) > 0);
      const i = stoppage90
        ? 6
        : mn <= 15
          ? 0
          : mn <= 30
            ? 1
            : mn <= 45
              ? 2
              : mn <= 60
                ? 3
                : mn <= 75
                  ? 4
                  : 5;
      goalMinutes[i]++;
    }
  }
  // Gule kort per kamp (apiId → antall straight YELLOW) – for q19 (flest gule kort-kamp).
  // + røde kort (RED/YELLOW_RED) og straffemål i ÅPENT spill (goal.type PENALTY – straffekonk-
  //   spark ligger ikke i goals-arrayet) per kamp – for custom auto «rødt kort el. straffe»-kamp.
  const matchYellows = {};
  const matchReds = {};
  const matchPenaltyGoals = {};
  // + spillere med kort (alle korttyper, rå API-navn – klienten legger til etternavn-varianter)
  //   og tidligste mål-minutt per kamp – for custom auto «spillere som får kort» / «tidligste
  //   mål»-kamp. matchFirstGoal har null når kampen mangler mål med minutt; nøkkelen finnes for
  //   alle cachede kamper, så klienten kan skille «målløs» fra «deep data mangler».
  const matchCardedPlayers = {};
  const matchFirstGoal = {};
  for (const [id, m] of Object.entries(cache.matches)) {
    matchYellows[id] = (m.bookings || []).filter((b) => b.card === 'YELLOW').length;
    matchReds[id] = (m.bookings || []).filter((b) => b.card === 'RED' || b.card === 'YELLOW_RED').length;
    matchPenaltyGoals[id] = (m.goals || []).filter((g) => g.type === 'PENALTY').length;
    matchCardedPlayers[id] = [...new Set((m.bookings || []).map((b) => b.name).filter(Boolean))];
    const mins = (m.goals || []).map((g) => g.minute).filter((x) => x != null);
    matchFirstGoal[id] = mins.length ? Math.min(...mins) : null;
  }

  return {
    ...aggregate(cache),
    autoBonus: autoBonusFrom(cache),
    playedIds: Object.keys(cache.played).map(Number), // spillere m/ spilletid – for q16
    playedAt: cache.played, // spiller-id → tidligste kampdag (noon-ISO) el. true – daterer q16
    matchYellows, // apiId → antall gule kort – for q19
    matchReds, // apiId → antall røde kort (RED/YELLOW_RED) – for custom auto (rødt kort-kamp)
    matchPenaltyGoals, // apiId → antall straffemål i åpent spill – for custom auto (straffe-kamp)
    matchCardedPlayers, // apiId → spillere med kort – for custom auto (kort-spillere)
    matchFirstGoal, // apiId → tidligste mål-minutt (null = målløs) – for custom auto (tidligste mål)
    finalReferee: finalMatch?.referee || null, // for q11
    fastestGoal, // for q6 live-indikator
    fastestGoals, // alle mål på det laveste minuttet (q6 – sekunder mangler i API-et)
    goalMinutes, // mål per 15-min-bolk – for «Nerding»
    coverage: { cached: Object.keys(cache.matches).length, relevant: relevant.length },
    updatedAt: Date.now(),
  };
}

export default async function handler(req, res) {
  const apiKey = process.env.FOOTBALL_API_KEY || process.env.VITE_FOOTBALL_API_KEY;
  if (!apiKey) return send(res, 500, { error: 'FOOTBALL_API_KEY er ikke konfigurert.' });
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  try {
    const data = await computeStats(apiKey, kvUrl, kvToken);
    return send(res, 200, data, 's-maxage=30, stale-while-revalidate=120');
  } catch (e) {
    return send(res, 502, { error: e instanceof Error ? e.message : String(e) });
  }
}
