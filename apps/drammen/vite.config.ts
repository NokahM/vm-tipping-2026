import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Last inn env (også uten VITE_-prefiks) slik at dev-proxyen kan legge på nøkkelen.
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.FOOTBALL_API_KEY || env.VITE_FOOTBALL_API_KEY || '';

  return {
    plugins: [react(), tailwindcss()],
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
      },
    },
  };
});
