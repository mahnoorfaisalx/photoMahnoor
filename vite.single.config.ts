import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// Builds the whole app into one self-contained HTML file (dist-single/index.html),
// handy for sharing a preview or opening from disk.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      '@imgly/background-removal': fileURLToPath(new URL('./src/lib/stubs/bg-removal-stub.ts', import.meta.url)),
    },
  },
  build: { outDir: 'dist-single', chunkSizeWarningLimit: 10000 },
});
