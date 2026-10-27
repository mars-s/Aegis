import { createReadStream, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { z } from 'zod';
const BuildSchema = z.object({ implementation: z.enum(['legacy', 'react']), facade: z.boolean() });
const contentTypes: Readonly<Record<string, string>> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream' };
/** Existing suites can keep their listener and assertions while receiving only built assets. */
export function productionBrowser(implementation: 'legacy' | 'react'): Plugin {
  return {
    name: 'aegis-production-browser-check',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'aegis-build.json', source: JSON.stringify({ implementation, facade: process.env.AEGIS_TEST_FACADE === '1' }) }); },
    configureServer(server) {
      if (process.env.AEGIS_BROWSER_BUILD !== 'production') return;
      const root = resolve(server.config.root, server.config.build.outDir);
      const value: unknown = JSON.parse(readFileSync(join(root, 'aegis-build.json'), 'utf8'));
      const built = BuildSchema.parse(value);
      if (built.implementation !== implementation || !built.facade) throw new Error('Build the selected UI with AEGIS_TEST_FACADE=1 before production browser checks.');
      server.middlewares.use((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
        const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!path.startsWith(root + sep)) { response.statusCode = 403; response.end(); return; }
        try {
          if (!statSync(path).isFile()) throw new Error('Not a file');
          response.setHeader('Content-Type', contentTypes[extname(path)] ?? 'application/octet-stream');
          response.setHeader('X-Aegis-Build', built.implementation + ':production');
          createReadStream(path).pipe(response);
        } catch { response.statusCode = 404; response.end('Production asset not found'); }
      });
    },
  };
}
