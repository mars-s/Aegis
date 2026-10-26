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
all.push('orb-capture');
// Streaming previews of what an agent is writing.
all.push('agent-drafts');
// Ask AI about the selected windows.
all.push('ask-selection');
// Office tools in the sheet and slide editors.
all.push('office');
// Editor camera bookmarks and explicit slide backgrounds in both browser engines.
all.push('editor-return');
all.push('editor-context');
// Active-slide workspace and painted chart/diagram text in the shipped bundle.
all.push('deck-studio');
// CSV import and plain-composer data analysis.
all.push('data-import');
// External MCP sessions share imported sources and editable documents with the production UI.
all.push('mcp');
// Shared UI controls and theme captures from the shipped bundle.
all.push('design-system');
all.push('controls-polish');
// Canvas chrome: link handles, sidebar placement and alignment.
all.push('canvas-chrome');
// Data viewer, deletion recovery, typography and sheet units.
all.push('data-trust');
// Empty board actions, onboarding, Library home and far-zoom clusters.
all.push('first-minute');
// Readable summaries and shared zoom tiers in Chromium and WebKit.
all.push('semantic-zoom');
// Fresh agent Undo and complete capture-batch retrieval in the production bundle.
all.push('trust-undo');
const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
const failed = [];
for (const name of names) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [new URL(`./${name}.mjs`, import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, AEGIS_VITE_CACHE: process.env.AEGIS_VITE_CACHE || mkdtempSync(join(tmpdir(), 'aegis-vite-')) } });
  const ok = r.status === 0;
  console.log(`${ok ? 'pass' : 'FAIL'} ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (!ok) { failed.push(name); console.log((r.stdout + r.stderr).split('\n').filter(l => !l.includes('\x1b[2m')).slice(-15).join('\n')); }
}
console.log(`${names.length - failed.length}/${names.length} UI suites passed${failed.length ? ': failed ' + failed.join(', ') : ''}`);
process.exitCode = failed.length ? 1 : 0;
