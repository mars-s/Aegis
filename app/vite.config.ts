import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// item 14: local PDF fonts, CMaps and decoders for development and the packaged UI.
import { pdfResources } from './src/features/imports/pdf-resources.ts';

// The native app's version, shown in Settings > About. A copied UI without the Tauri folder says 'dev'.
function nativeVersion() {
  try { return JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')).version; } catch { return 'dev'; }
}

// Relative asset paths: the same build loads from the app bundle, from the host's ui folder, or from a preview.
export default defineConfig({
  plugins: [svelte(), pdfResources()],
  // Worktrees share dependencies, but keep optimisation output inside their own checkout.
  cacheDir: '.vite-cache',
  define: { __AEGIS_VERSION__: JSON.stringify(nativeVersion()) },
  base: './',
  clearScreen: false,
  server: { port: 5173, strictPort: true, host: '127.0.0.1', fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), realpathSync(fileURLToPath(new URL('./node_modules', import.meta.url)))] } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'safari16', sourcemap: true },
});
