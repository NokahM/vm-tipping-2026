// Vercel serverless-funksjon: delt admin-data (fasit + sluttspill-tips) i Upstash Redis.
// «Vercel KV»/Upstash injiserer KV_REST_API_URL + KV_REST_API_TOKEN automatisk når
// storen kobles til prosjektet. Skriving krever admin-passordet (ADMIN_PASSWORD).
//
//   GET  /api/state?app=drammen          → { knockoutTips, bonusAnswers }   (offentlig)
//   POST /api/state?app=drammen          → { ok: true }                     (krever passord)
//        body: { password, knockoutTips?, bonusAnswers? }

const APPS = new Set(['drammen', 'alles']);

function kvEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

/** Kjører én Redis-kommando via Upstash REST API, f.eks. ['GET', key] eller ['SET', key, val]. */
async function kvCommand(cmd) {
  const { url, token } = kvEnv();
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`KV svarte ${res.status}`);
  const json = await res.json();
  return json.result;
}

export default async function handler(req, res) {
  const { url, token } = kvEnv();
  if (!url || !token) {
    return res.status(500).json({ error: 'KV er ikke konfigurert på serveren.' });
  }

  const app = String(req.query.app || '');
  if (!APPS.has(app)) {
    return res.status(400).json({ error: 'Ukjent eller manglende app-parameter.' });
  }

  const kKnock = `${app}:knockoutTips`;
  const kBonus = `${app}:bonusAnswers`;

  if (req.method === 'GET') {
    try {
      const [knock, bonus] = await Promise.all([
        kvCommand(['GET', kKnock]),
        kvCommand(['GET', kBonus]),
      ]);
      // Kort edge-cache: nær-sanntid, men skåner KV mot mange samtidige lesere.
      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
      return res.status(200).json({
        knockoutTips: knock ? JSON.parse(knock) : {},
        bonusAnswers: bonus ? JSON.parse(bonus) : {},
      });
    } catch (e) {
      return res.status(502).json({ error: `Kunne ikke lese fra KV: ${e.message}` });
    }
  }

  if (req.method === 'POST') {
    const adminPw = process.env.ADMIN_PASSWORD;
    if (!adminPw) {
      return res.status(500).json({ error: 'ADMIN_PASSWORD er ikke satt på serveren.' });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};

    if (body.password !== adminPw) {
      return res.status(401).json({ error: 'Feil passord.' });
    }

    try {
      const ops = [];
      if (body.knockoutTips !== undefined) {
        ops.push(kvCommand(['SET', kKnock, JSON.stringify(body.knockoutTips)]));
      }
      if (body.bonusAnswers !== undefined) {
        ops.push(kvCommand(['SET', kBonus, JSON.stringify(body.bonusAnswers)]));
      }
      await Promise.all(ops);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(502).json({ error: `Kunne ikke skrive til KV: ${e.message}` });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
