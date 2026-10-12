import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';
// @ts-expect-error The build helper is executed and tested directly by Node.
import {publicShellPlugin} from './scripts/public-shell.mjs';

import { reticle } from '@reticlehq/vite-plugin';
function localPort(value: string | undefined, fallback: number) {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local development port');
  return port;
}

export default defineConfig({
  plugins: [reticle({ port: 4400 }), react(),publicShellPlugin()],
  server: {
    host: '127.0.0.1',
    port: localPort(process.env.UNDERSTOOD_WEB_PORT, 3020),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${localPort(process.env.UNDERSTOOD_API_PORT, 3021)}` },
  },
});
