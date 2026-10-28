import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { browserTestEntries } from '../scripts/browser-test-entries.ts';
import { productionBrowser } from '../scripts/production-browser.ts';
import { uiImplementation } from '../scripts/ui-implementation.ts';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// item 14: local PDF fonts, CMaps and decoders for development and the packaged UI.
import { pdfResources } from '../scripts/pdf-resources.ts';

// The native app's version, shown in Settings > About. A copied UI without the Tauri folder says 'dev'.
function nativeVersion() {
  try { return JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')).version; } catch { return 'dev'; }
}

const implementation = uiImplementation(process.env.AEGIS_UI_IMPL);

// Relative asset paths: the same build loads from the app bundle, from the host's ui folder, or from a preview.
export default defineConfig({
  plugins: [
    productionBrowser(implementation),
    react(),
    pdfResources(),

  ],
  define: { __AEGIS_VERSION__: JSON.stringify(nativeVersion()), __AEGIS_TEST_FACADE__: JSON.stringify(process.env.AEGIS_TEST_FACADE === '1') },
  base: './',
  // Worktrees share dependencies, but keep optimisation output inside their own checkout.
  cacheDir: process.env.AEGIS_VITE_CACHE || '.vite-cache',
  clearScreen: false,
  server: { port: 5173, strictPort: true, host: '127.0.0.1', fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), realpathSync(fileURLToPath(new URL('./node_modules', import.meta.url))), fileURLToPath(new URL('../packages', import.meta.url)), realpathSync(fileURLToPath(new URL('../node_modules', import.meta.url)))] } },
  build: { rolldownOptions: { preserveEntrySignatures: process.env.AEGIS_TEST_FACADE === '1' ? 'strict' : false, input: browserTestEntries(fileURLToPath(new URL('.', import.meta.url))), output: { entryFileNames: chunk => chunk.name.startsWith('src/') ? '[name]' : 'assets/[name]-[hash].js' } }, assetsInlineLimit: 0, outDir: 'dist', emptyOutDir: true, target: 'safari16', sourcemap: true },
});
