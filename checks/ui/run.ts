import { log as checkLog, mkdtempSync } from './playwright.ts';
// Runs every UI check one after another (each owns a fixed Vite port, so they never run together).
// node checks/ui/run.ts [name ...]
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const all = ['canvas', 'library', 'docs', 'editors', 'deck', 'draw', 'media', 'imports', 'wireframe', 'editing', 'hmr', 'genui', 'parity', 'agent-types', 'agents', 'agent-motion'];
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
all.push('chart-defaults');
// Active-slide workspace and painted chart/diagram text in the shipped bundle.
all.push('deck-studio');
// CSV import and plain-composer data analysis.
all.push('data-import');
// External MCP sessions share imported sources and editable documents with the production UI.
all.push('mcp');
// Shared UI controls and theme captures from the shipped bundle.
all.push('design-system');
all.push('controls-polish');
all.push('fit-finish');
// Canvas chrome: link handles, sidebar placement and alignment.
all.push('canvas-chrome');
// Data viewer, deletion recovery, typography and sheet units.
all.push('data-trust');
// Empty board actions, onboarding, Library home and far-zoom geometry.
all.push('first-minute');
// Plain camera geometry and original content at every zoom in Chromium and WebKit.
all.push('semantic-zoom');
all.push('overview-model');
all.push('evidence-fidelity');
all.push('spatial-interaction');
all.push('spatial-memory');
// Fresh agent Undo and complete capture-batch retrieval in the production bundle.
all.push('trust-undo');
all.push('crop-a11y');
const requested = process.argv.slice(2);
const selector = requested.find(argument => argument.startsWith('--impl='));
if (selector && selector !== '--impl=react') throw new Error('The UI runner supports React only.');
const implementation = 'react';
if (all.length !== 44) throw new Error('The UI manifest must retain all 44 suites.');
const suites = requested.filter(argument => !argument.startsWith('--impl='));
for (const name of suites) {
  if (!/^[a-z][a-z0-9-]*$/.test(name) || !existsSync(new URL(`./${name}.ts`, import.meta.url))) throw new Error(`Unknown UI suite ${JSON.stringify(name)}.`);
}
const names = suites.length ? suites : all;
checkLog(`UI implementation: ${implementation}`);
const failed = [];
for (const name of names) {
  const t0 = Date.now();
  const data = mkdtempSync(join(tmpdir(), 'aegis-ui-data-'));
  const cache = mkdtempSync(join(tmpdir(), 'aegis-ui-vite-'));
  try {
  const r = spawnSync(process.execPath, [new URL(`./${name}.ts`, import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, AEGIS_UI_IMPL: implementation, AEGIS_TEST_FACADE: '1', AEGIS_DATA: data, AEGIS_VITE_CACHE: cache } });
  const ok = r.status === 0;
  checkLog(`${ok ? 'pass' : 'FAIL'} ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (!ok) { failed.push(name); checkLog((r.stdout + r.stderr).split('\n').filter(l => !l.includes('\x1b[2m')).slice(-15).join('\n')); }
  } finally { rmSync(data, { recursive: true, force: true }); rmSync(cache, { recursive: true, force: true }); }
}
checkLog(`${names.length - failed.length}/${names.length} UI suites passed${failed.length ? ': failed ' + failed.join(', ') : ''}`);
process.exitCode = failed.length ? 1 : 0;
