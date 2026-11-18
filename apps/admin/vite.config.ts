import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev port 18002 (TASK_74 decision 5) — also set via `--port` in package.json's
// `dev`/`preview` scripts; repeated here so `vite` run directly still picks it up.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 18002,
    host: '127.0.0.1',
  },
  preview: {
    port: 18002,
    host: '127.0.0.1',
  },
});
