#!/usr/bin/env node
// A build wrapper records provenance only after the real native build succeeds.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { artifactIdentity, checkout } from './build-identity.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { values } = parseArgs({ options: { out: { type: 'string' } } });
assert(values.out, 'Pass --out /tmp/aegis-native-build.json');
const before = checkout(root);
assert.equal(before.trackedChanges, '', 'Commit tracked changes before building the measured head');
const data = await mkdtemp(join(tmpdir(), 'aegis-native-build-data-'));
const cache = await mkdtemp(join(tmpdir(), 'aegis-native-build-vite-'));
const environment = { ...process.env, AEGIS_DATA: data, AEGIS_VITE_CACHE: cache, AEGIS_UI_IMPL: 'react', AEGIS_TEST_FACADE: '1', AEGIS_PORT_OFFSET: '4920' };
delete environment.AEGIS_SAFE;
delete environment.AEGIS_UI;
const target = resolve(environment.CARGO_TARGET_DIR || join(root, 'src-tauri/target'));
const started = new Date().toISOString();
const child = spawn('npm', ['run', 'build'], { cwd: root, env: environment, stdio: 'inherit' });
await new Promise((done, fail) => {
  child.once('error', fail);
  child.once('exit', (code, signal) => code === 0 ? done() : fail(new Error(`Native build failed: ${code ?? signal}`)));
});
assert.deepEqual(checkout(root), before, 'Checkout changed during the build');
const app = join(target, 'release/bundle/macos/Aegis.app/Contents/MacOS/aegis');
const ui = join(root, 'app/dist');
const identity = await artifactIdentity(app, ui);
const manifest = {
  schema: 1, ...before, command: 'npm run build', started, finished: new Date().toISOString(),
  switches: { AEGIS_UI_IMPL: 'react', AEGIS_TEST_FACADE: '1' }, app, ui, ...identity,
};
await mkdir(dirname(resolve(values.out)), { recursive: true });
await writeFile(resolve(values.out), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Native React build ${before.head}: ${resolve(values.out)}`);
