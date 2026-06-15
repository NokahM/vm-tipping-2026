// Vercel serverless-funksjon: proxy mot football-data.org sitt enkeltkamp-endepunkt
// (deep data: goals, bookings, lineups). Holder API-nøkkelen server-side.
// Klienten kaller /api/matchdetail?id=123 (samme origin).

export default async function handler(req, res) {
  const key = process.env.FOOTBALL_API_KEY || process.env.VITE_FOOTBALL_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'FOOTBALL_API_KEY er ikke konfigurert på serveren.' });
  }

  const id = String(req.query.id || '').replace(/\D/g, '');
  if (!id) {
    return res.status(400).json({ error: 'Mangler eller ugyldig id.' });
  }

  try {
    const upstream = await fetch(`https://api.football-data.org/v4/matches/${id}`, {
      headers: { 'X-Auth-Token': key },
    });
    const body = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Kort edge-cache: ferske live-hendelser, men skåner rategrensen ved mange lesere.
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(upstream.status).send(body);
  } catch (e) {
    return res.status(502).json({ error: `Kunne ikke nå football-data.org: ${e.message}` });
  }
}
