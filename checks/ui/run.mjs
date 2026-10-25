// Runs every UI check one after another (each owns a fixed Vite port, so they never run together).
// node checks/ui/run.mjs [name ...]
import { spawnSync } from 'node:child_process';
const all = ['canvas', 'library', 'docs', 'editors', 'deck', 'draw', 'media', 'imports', 'wireframe', 'editing', 'svelte', 'genui', 'parity', 'agent-types', 'agents', 'agent-motion'];
// fix1: chat context, separate shortcuts and the two notes entry points.
all.push('polish');
const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
const failed = [];
for (const name of names) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [new URL(`./${name}.mjs`, import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const ok = r.status === 0;
  console.log(`${ok ? 'pass' : 'FAIL'} ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (!ok) { failed.push(name); console.log((r.stdout + r.stderr).split('\n').filter(l => !l.includes('\x1b[2m')).slice(-15).join('\n')); }
}
process.exitCode = failed.length ? 1 : 0;
