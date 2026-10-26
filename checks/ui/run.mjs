// Runs every UI check one after another (each owns a fixed Vite port, so they never run together).
// node checks/ui/run.mjs [name ...]
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const all = ['canvas', 'library', 'docs', 'editors', 'deck', 'draw', 'media', 'imports', 'wireframe', 'editing', 'svelte', 'genui', 'parity', 'agent-types', 'agents', 'agent-motion'];
// fix1: chat context, separate shortcuts and the two notes entry points.
all.push('polish');
// PM4: pan modifiers take priority over canvas gestures.
all.push('pan');
// PM5: menu containment and collision-free spatial agent recovery.
all.push('agent-edges');
// PM6 finding 1: completion must survive an older in-flight agent read.
all.push('agent-race');
// Production bundle geometry in Chromium and WebKit.
all.push('prod-composer');
// Streaming previews of what an agent is writing.
all.push('agent-drafts');
// Ask AI about the selected windows.
all.push('ask-selection');
// Office tools in the sheet and slide editors.
all.push('office');
// CSV import and plain-composer data analysis.
all.push('data-import');
// External MCP sessions share imported sources and editable documents with the production UI.
all.push('mcp');
all.push('canvas-chrome');
const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
const failed = [];
for (const name of names) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [new URL(`./${name}.mjs`, import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, AEGIS_VITE_CACHE: mkdtempSync(join(tmpdir(), 'aegis-vite-')) } });
  const ok = r.status === 0;
  console.log(`${ok ? 'pass' : 'FAIL'} ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (!ok) { failed.push(name); console.log((r.stdout + r.stderr).split('\n').filter(l => !l.includes('\x1b[2m')).slice(-15).join('\n')); }
}
process.exitCode = failed.length ? 1 : 0;
