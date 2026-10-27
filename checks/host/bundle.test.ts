import { z } from 'zod/v4';
// The packaged app copies only the files listed in tauri.conf.json resources. Every relative import the host makes
// (directly or through shared modules) must be inside one of them, or the installed host crashes at start.
import { test } from 'node:test';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import {createRequire} from 'node:module';
import { dirname, join, resolve, relative } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname);
const raw: unknown = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const conf = z.object({ bundle: z.object({ resources: z.record(z.string(), z.string()) }) }).parse(raw);
const bundled = Object.keys(conf.bundle.resources).map(p => resolve(root, 'src-tauri', p));
const inBundle = (file: string) => bundled.some(b => file === b || file.startsWith(b + '/'));

test('every file the host imports is bundled with the app', () => {
  execFileSync(process.execPath, [join(root, 'scripts/stage-runtime.ts')], {cwd:root, stdio:'pipe'});
  const runtime = join(root, 'runtime');
  const seen = new Set<string>(), missing: string[] = [];
  const walk = (file: string): void => {
    if (seen.has(file)) return; seen.add(file);
    if (!inBundle(file)) missing.push(relative(root, file));
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?['"]((?:\.{1,2}\/|@aegis\/)[^'"]+)['"]/g)) {
      const specifier = m[1]; if (!specifier) continue;
      const next = specifier.startsWith('@aegis/') ? createRequire(file).resolve(specifier) : resolve(dirname(file), specifier);
      if (specifier.startsWith('@aegis/')) {
        const packageName=specifier.split('/').slice(0,2).join('/').replace('@aegis/','');
        const metadata=join(runtime,'packages',packageName,'package.json');
        if(!inBundle(metadata)) missing.push(relative(root,metadata));
      }
      try { if (statSync(next).isFile()) walk(next); } catch { missing.push(relative(root, next) + ' (not found)'); }
    }
  };
  walk(join(runtime, 'agent/dist/main.js'));
  assert.deepEqual(missing, []);
});
