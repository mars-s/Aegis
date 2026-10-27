// The packaged app copies only the files listed in tauri.conf.json resources. Every relative import the host makes
// (directly or through shared modules) must be inside one of them, or the installed host crashes at start.
import { test } from 'node:test';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import {createRequire} from 'node:module';
import { dirname, join, resolve, relative } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname);
const conf = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const bundled = Object.keys(conf.bundle.resources).map(p => resolve(root, 'src-tauri', p));
const inBundle = file => bundled.some(b => file === b || file.startsWith(b + '/'));

test('every file the host imports is bundled with the app', () => {
  execFileSync(process.execPath, [join(root, 'scripts/stage-runtime.ts')], {cwd:root, stdio:'pipe'});
  const runtime = join(root, 'runtime');
  const seen = new Set(), missing = [];
  const walk = file => {
    if (seen.has(file)) return; seen.add(file);
    if (!inBundle(file)) missing.push(relative(root, file));
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?['"]((?:\.{1,2}\/|@aegis\/)[^'"]+)['"]/g)) {
      const next = m[1].startsWith('@aegis/') ? createRequire(file).resolve(m[1]) : resolve(dirname(file), m[1]);
      if (m[1].startsWith('@aegis/')) {
        const packageName=m[1].split('/').slice(0,2).join('/').replace('@aegis/','');
        const metadata=join(runtime,'packages',packageName,'package.json');
        if(!inBundle(metadata)) missing.push(relative(root,metadata));
      }
      try { if (statSync(next).isFile()) walk(next); } catch { missing.push(relative(root, next) + ' (not found)'); }
    }
  };
  walk(join(runtime, 'agent/server.mjs'));
  assert.deepEqual(missing, []);
});
