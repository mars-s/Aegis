import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Relative asset paths: the same build loads from the app bundle, from the host's ui folder, or from a preview.
export default defineConfig({
  plugins: [svelte()],
  base: './',
  clearScreen: false,
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'safari16', sourcemap: true },
});
