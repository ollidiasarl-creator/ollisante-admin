import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Le site est servi par le serveur Ollisanté sous /admin/ (même adresse que l'API : pas de CORS).
// En développement, les appels /api et /media sont relayés vers le serveur local (port 8088).
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: { outDir: '../ollisante-backend 2/src/main/resources/static/admin', emptyOutDir: true },
  server: {
    port: 5180,
    proxy: Object.fromEntries(
      ['/api', '/media'].map((path) => [
        path,
        {
          target: 'http://127.0.0.1:8088',
          // Sans en-tête Origin, le serveur traite l'appel comme venant de sa propre adresse (comme en production).
          configure: (proxy: { on: (e: string, cb: (req: { removeHeader: (h: string) => void }) => void) => void }) =>
            proxy.on('proxyReq', (req) => req.removeHeader('origin')),
        },
      ]),
    ),
  },
});
