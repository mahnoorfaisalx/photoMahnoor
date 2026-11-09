import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the built app work from any sub-path (GitHub Pages, static hosting, file server)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
  server: { host: true },
});
