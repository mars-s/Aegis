import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

// The native app's version, shown in Settings > About. A copied UI without the Tauri folder says 'dev'.
function nativeVersion() {
  try { return JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')).version; } catch { return 'dev'; }
}

// Relative asset paths: the same build loads from the app bundle, from the host's ui folder, or from a preview.
export default defineConfig({
  plugins: [svelte()],
  define: { __AEGIS_VERSION__: JSON.stringify(nativeVersion()) },
  base: './',
  clearScreen: false,
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'safari16', sourcemap: true },
});
