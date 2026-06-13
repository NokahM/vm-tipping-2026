// Vercel serverless-funksjon: proxy mot football-data.org.
// Holder API-nøkkelen server-side og unngår CORS i produksjon.
// Klienten kaller /api/matches?status=FINISHED (samme origin).

const ALLOWED_STATUS = new Set(['FINISHED', 'SCHEDULED', 'IN_PLAY', 'TIMED', 'PAUSED']);
const ALLOWED_STAGE = new Set([
  'GROUP_STAGE',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
]);

export default async function handler(req, res) {
  const key = process.env.FOOTBALL_API_KEY || process.env.VITE_FOOTBALL_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'FOOTBALL_API_KEY er ikke konfigurert på serveren.' });
  }

  const params = new URLSearchParams();
  const { status, stage } = req.query;
  if (status && ALLOWED_STATUS.has(status)) params.set('status', status);
  if (stage && ALLOWED_STAGE.has(stage)) params.set('stage', stage);
  const query = params.toString() ? `?${params.toString()}` : '';

  try {
    const upstream = await fetch(
      `https://api.football-data.org/v4/competitions/WC/matches${query}`,
      { headers: { 'X-Auth-Token': key } },
    );
    const body = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Cache på Vercels edge i 60s for å skåne rategrensen (10 kall/min).
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(upstream.status).send(body);
  } catch (e) {
    return res.status(502).json({ error: `Kunne ikke nå football-data.org: ${e.message}` });
  }
}
