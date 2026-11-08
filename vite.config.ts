import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-lecture-drafts',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/data/drafts', async (request, response, next) => {
          const match = /^\/([A-Za-z0-9_-]{1,32})\.json(?:\?.*)?$/.exec(request.url ?? '');
          if (request.method !== 'GET' || !match) return next();

          try {
            const draft = await readFile(resolve(repoRoot, 'data/drafts', `${match[1]}.json`));
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(draft);
          } catch {
            response.statusCode = 404;
            response.end('Draft not found');
          }
        });
      },
    },
  ],
});
