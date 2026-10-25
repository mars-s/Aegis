// The packaged app copies only the files listed in tauri.conf.json resources. Every relative import the host makes
// (directly or through shared modules) must be inside one of them, or the installed host crashes at start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

const root = resolve(new URL('../..', import.meta.url).pathname);
const conf = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const bundled = Object.keys(conf.bundle.resources).map(p => resolve(root, 'src-tauri', p));
const inBundle = file => bundled.some(b => file === b || file.startsWith(b + '/'));

test('every file the host imports is bundled with the app', () => {
  const seen = new Set(), missing = [];
  const walk = file => {
    if (seen.has(file)) return; seen.add(file);
    if (!inBundle(file)) missing.push(relative(root, file));
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const next = resolve(dirname(file), m[1]);
      try { if (statSync(next).isFile()) walk(next); } catch { missing.push(relative(root, next) + ' (not found)'); }
    }
  };
  walk(join(root, 'agent/server.mjs'));
  assert.deepEqual(missing, []);
});
