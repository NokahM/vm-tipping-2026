import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import statsHandler from './api/stats.js';

const APPS = new Set(['drammen', 'alles']);

/**
 * Dev-versjon av /api/stats: gjenbruker den samme serverless-handleren (api/stats.js).
 * Den leser nøkler fra process.env, som vi fyller fra .env.local i defineConfig under.
 */
function statsApiPlugin(): Plugin {
  return {
    name: 'dev-api-stats',
    configureServer(server) {
      server.middlewares.use('/api/stats', async (req: any, res: any) => {
        try {
          await statsHandler(req, res);
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
      });
    },
  };
}

/**
 * Dev-versjon av /api/state (samme logikk som serverless-funksjonen api/state.js),
 * slik at admin-lagring mot KV også fungerer under `npm run dev`. Leser KV-nøklene
 * og ADMIN_PASSWORD fra lokal .env.local.
 */
function kvStatePlugin(env: Record<string, string>): Plugin {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '';
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '';
  const adminPw = env.ADMIN_PASSWORD || '';

  async function kv(cmd: unknown[]): Promise<unknown> {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    if (!r.ok) throw new Error(`KV svarte ${r.status}`);
    const data = (await r.json()) as { result: unknown };
    return data.result;
  }

  return {
    name: 'dev-api-state',
    configureServer(server) {
      server.middlewares.use('/api/state', async (req: any, res: any) => {
        const send = (code: number, obj: unknown) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(obj));
        };
        if (!url || !token) return send(500, { error: 'KV ikke konfigurert lokalt (.env.local).' });

        const u = new URL(req.url || '/', 'http://localhost');
        const app = u.searchParams.get('app') || '';
        if (!APPS.has(app)) return send(400, { error: 'Ukjent app.' });
        const kKnock = `${app}:knockoutTips`;
        const kBonus = `${app}:bonusAnswers`;
        const kQuestions = `${app}:bonusQuestions`;
        const kTips = `${app}:bonusTips`;

        try {
          if (req.method === 'GET') {
            const [k, b, q, t] = await Promise.all([
              kv(['GET', kKnock]),
              kv(['GET', kBonus]),
              kv(['GET', kQuestions]),
              kv(['GET', kTips]),
            ]);
            return send(200, {
              knockoutTips: k ? JSON.parse(k as string) : {},
              bonusAnswers: b ? JSON.parse(b as string) : {},
              bonusQuestions: q ? JSON.parse(q as string) : [],
              bonusTips: t ? JSON.parse(t as string) : {},
            });
          }
          if (req.method === 'POST') {
            let raw = '';
            for await (const chunk of req) raw += chunk;
            let body: any = {};
            try {
              body = JSON.parse(raw);
            } catch {
              body = {};
            }
            if (!adminPw || body.password !== adminPw) return send(401, { error: 'Feil passord.' });
            const ops: Promise<unknown>[] = [];
            if (body.knockoutTips !== undefined)
              ops.push(kv(['SET', kKnock, JSON.stringify(body.knockoutTips)]));
            if (body.bonusAnswers !== undefined)
              ops.push(kv(['SET', kBonus, JSON.stringify(body.bonusAnswers)]));
            if (body.bonusQuestions !== undefined)
              ops.push(kv(['SET', kQuestions, JSON.stringify(body.bonusQuestions)]));
            if (body.bonusTips !== undefined)
              ops.push(kv(['SET', kTips, JSON.stringify(body.bonusTips)]));
            await Promise.all(ops);
            return send(200, { ok: true });
          }
          return send(405, { error: 'Method not allowed' });
        } catch (e) {
          return send(502, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Last inn env (også uten VITE_-prefiks) slik at dev-proxyen kan legge på nøkkelen.
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.FOOTBALL_API_KEY || env.VITE_FOOTBALL_API_KEY || '';

  // Eksponer nøkler til api/stats.js (den leser process.env, som under dev ellers er tom).
  process.env.FOOTBALL_API_KEY ||= apiKey;
  process.env.KV_REST_API_URL ||= env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '';
  process.env.KV_REST_API_TOKEN ||= env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '';

  return {
    plugins: [react(), tailwindcss(), kvStatePlugin(env), statsApiPlugin()],
    server: {
      // I dev proxier vi til football-data.org for å unngå CORS. Nøkkelen
      // legges på server-side her, så den eksponeres aldri i nettleseren.
      proxy: {
        '/api/matches': {
          target: 'https://api.football-data.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/matches/, '/v4/competitions/WC/matches'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (apiKey) proxyReq.setHeader('X-Auth-Token', apiKey);
            });
          },
        },
        // Enkeltkamp-detaljer (deep data: goals, bookings). /api/matchdetail?id=123
        '/api/matchdetail': {
          target: 'https://api.football-data.org',
          changeOrigin: true,
          rewrite: (path) => {
            const m = path.match(/id=(\d+)/);
            return m ? `/v4/matches/${m[1]}` : path;
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (apiKey) proxyReq.setHeader('X-Auth-Token', apiKey);
            });
          },
        },
      },
    },
  };
});
