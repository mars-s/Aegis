import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

// Preserve the resource filenames pdf.js requests. Vite hashes ?url imports,
// whereas CMaps, fallback fonts and WASM are requested by their original names.
export function pdfResources(): Plugin {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve('pdfjs-dist/package.json'));
  const files = new Map<string, string>();
  files.set('pdfjs/LICENSE', join(root, 'LICENSE'));
  files.set('licences/fflate-LICENSE.txt', join(dirname(require.resolve('fflate/package.json')), 'LICENSE'));
  for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    for (const file of readdirSync(join(root, folder))) {
      // pdf.js includes an old GPL Liberation build. Ship the OFL 2.1.5 release instead.
      if (folder === 'standard_fonts' && /^(LiberationSans-|LICENSE_LIBERATION)/.test(file)) continue;
      files.set(`pdfjs/${folder}/${file}`, join(root, folder, file));
    }
  }
  const fonts = new URL('./fonts/', import.meta.url);
  for (const file of readdirSync(fonts)) files.set(`pdfjs/standard_fonts/${file}`, fileURLToPath(new URL(file, fonts)));
  const licences = new URL('./licences/', import.meta.url);
  for (const file of readdirSync(licences)) files.set(`licences/${file}`, fileURLToPath(new URL(file, licences)));
  return {
    name: 'aegis-pdf-resources',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = files.get((req.url || '').split('?')[0].replace(/^\//, ''));
        if (!path) return next();
        res.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        res.end(readFileSync(path));
      });
    },
    generateBundle() {
      for (const [fileName, path] of files) this.emitFile({ type: 'asset', fileName, source: readFileSync(path) });
    },
  };
}
