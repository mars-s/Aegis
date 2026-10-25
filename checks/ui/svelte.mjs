// Throwaway run: real host (fake model, temp data) + the Svelte app on the Vite dev server, headless Chromium.
import { chromium } from './playwright.mjs';
import { out } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const PORT_OFFSET = Number(process.env.AEGIS_PORT_OFFSET || 0); // separate worktrees can run checks at once
const repo = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), TOKEN = 'svelte-' + process.pid;
const theme = process.argv[2] || 'dark';
const host = spawn(process.execPath, ['--no-warnings', 'server.mjs'], { cwd: repo + '/agent', env: { ...process.env, AEGIS_DATA: mkdtempSync(join(tmpdir(), 'aegis-sv-')), AEGIS_PORT: '0', AEGIS_TOKEN: TOKEN, AEGIS_FAKE_MODEL: '1' } });
host.stderr.on('data', d => process.stderr.write('[host] ' + d));
const port = await new Promise(r => host.stdout.on('data', d => { const m = /"port":(\d+)/.exec(String(d)); if (m) r(m[1]); }));
const vite = spawn('npx', ['vite', '--port', String(5187 + PORT_OFFSET)], { cwd: repo + '/app', stdio: 'pipe' });
await new Promise(r => vite.stdout.on('data', d => { if (/Local/.test(String(d))) r(); }));
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: theme });
const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const log = (...a) => console.log('•', ...a);
try {
  await page.addInitScript(() => localStorage.setItem('aegis:onboarded', '1'));
  await page.goto(`http://127.0.0.1:${5187 + PORT_OFFSET}/?port=${port}&token=${TOKEN}`);
  await page.waitForFunction(() => window.aegis?.canvas?.board, null, { timeout: 15000 });
  log('loaded', await page.evaluate(() => aegis.canvas.board.name));
  // Seed through a fake agent so the create tool, its checks and placement all run.
  const boardId = await page.evaluate(() => aegis.canvas.board.id);
  const batch = [
    { op: 'create', type: 'title', text: 'Graph playground', x: 0, y: -10 },
    { op: 'create', type: 'object', kind: 'reply', x: 0, y: 60, w: 760, h: 240, data: { headline: 'Thursday was your busiest day', text: 'You finished **56 tasks** this week. Friday ended 75% above Monday. All figures are demo data.', figures: [{ label: 'Tasks this week', value: '56' }, { label: 'Busiest day', value: 'Thu', note: '16 tasks' }, { label: 'Mon to Fri', value: '+75%' }] }, ref: 'r' },
    { op: 'create', type: 'object', kind: 'plot', text: 'Tasks completed', x: 0, y: 330, w: 560, h: 380, data: { style: 'bar', x: { kind: 'category', label: 'Day' }, y: { format: 'number', label: 'Tasks' }, basis: 'Demo data, made up for this sample', knowledge: true, headline: { label: 'tasks this week', value: '56' }, series: [{ name: 'Tasks', points: [{ x: 'Mon', y: 8 }, { x: 'Tue', y: 12 }, { x: 'Wed', y: 6 }, { x: 'Thu', y: 16 }, { x: 'Fri', y: 14 }] }] }, ref: 'p' },
    { op: 'create', type: 'object', kind: 'plot', text: 'Focus vs meetings', x: 600, y: 330, w: 520, h: 380, data: { style: 'area_stacked', x: { kind: 'category' }, y: { format: 'duration', label: 'Hours' }, basis: 'Demo data', knowledge: true, series: [{ name: 'Focus', points: [{ x: 'Mon', y: 14400 }, { x: 'Tue', y: 18000 }, { x: 'Wed', y: 10800 }, { x: 'Thu', y: 21600 }, { x: 'Fri', y: 19800 }] }, { name: 'Meetings', points: [{ x: 'Mon', y: 7200 }, { x: 'Tue', y: 5400 }, { x: 'Wed', y: 10800 }, { x: 'Thu', y: 3600 }, { x: 'Fri', y: 3600 }] }] }, ref: 'a' },
    { op: 'create', type: 'object', kind: 'diagram', text: 'From idea to outcome', x: 0, y: 750, w: 1120, h: 420, data: { direction: 'right', nodes: [{ id: 'brief', name: '01 · Brief', kind: 'step', note: 'Choose a goal and audience.' }, { id: 'gen', name: '02 · Generate', kind: 'step', note: 'Draft a layout and content.' }, { id: 'review', name: '03 · Review', kind: 'step', note: 'Check clarity and usefulness.' }, { id: 'refine', name: '04 · Refine', kind: 'step', note: 'Adjust the draft from feedback.' }, { id: 'ready', name: '05 · Ready', kind: 'milestone' === 'x' ? 'step' : 'store', note: 'Keep the version that works.' }], edges: [{ from: 'brief', to: 'gen' }, { from: 'gen', to: 'review' }, { from: 'review', to: 'refine', label: 'changes' }, { from: 'refine', to: 'gen', label: 'redo' }, { from: 'review', to: 'ready', label: 'approved' }] }, ref: 'd' },
    { op: 'create', type: 'object', kind: 'sheet', text: 'Week by day', x: 1160, y: 330, w: 460, h: 300, data: { columns: [{ label: 'Day', kind: 'text' }, { label: 'Tasks', kind: 'number', best: 'max' }, { label: 'Focus', kind: 'duration' }, { label: 'On plan', kind: 'yes_no' }], rows: [{ cells: ['Mon', '8', '14400', 'yes'] }, { cells: ['Tue', '12', '18000', 'yes'] }, { cells: ['Wed', '6', '10800', 'no'] }, { cells: ['Thu', '16', '21600', 'yes'] }, { cells: ['Fri', '14', '19800', 'partial'] }] }, ref: 's' },
    { op: 'create', type: 'object', kind: 'plan', text: 'Next week', x: 1160, y: 680, w: 460, h: 380, data: { checkable: true, steps: [{ when: 'Mon', title: 'Plan the week', kind: 'task' }, { when: 'Tue', title: 'Draft the layout', kind: 'task', detail: 'Two options for the dashboard.' }, { when: 'Thu', title: 'Review with the team', kind: 'event', place: 'Studio' }, { when: 'Fri', title: 'Ship v1', kind: 'milestone' }] }, ref: 'pl' },
    { op: 'focus', ids: ['$r'] },
  ];
  await page.evaluate(([id, cmds]) => aegis.host.post('/agents', { boardId: id, brief: 'FAKE ' + JSON.stringify(cmds), model: { provider: 'fake', modelId: 'fake' } }), [boardId, batch]);
  await page.waitForFunction(() => aegis.canvas.board.cards.filter(c => c.type === 'object').length === 6, null, { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { aegis.canvas.fit(); });
  await page.waitForTimeout(900);
  const counts = await page.evaluate(() => ({ objects: document.querySelectorAll('.card.object .object').length, svgBars: document.querySelectorAll('.card.object.kind-plot svg path').length, nodes: document.querySelectorAll('.diagram .node').length, rows: document.querySelectorAll('.sheet tbody tr').length }));
  log('rendered', JSON.stringify(counts));
  await page.screenshot({ path: out(`objects-${theme}.png`) });
  // Zoom to 1 on the chart and diagram for a closer look.
  await page.evaluate(() => { const ids = aegis.canvas.board.cards.filter(c => c.kind === 'plot' || c.kind === 'reply').map(c => c.id); aegis.canvas.frameIds(ids, 1); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: out(`objects-${theme}-near.png`) });
  // Sort the sheet by Tasks (click header) and tick a plan step.
  await page.evaluate(() => aegis.canvas.frameIds(aegis.canvas.board.cards.filter(c => c.kind === 'sheet' || c.kind === 'plan').map(c => c.id), 1));
  await page.waitForTimeout(700);
  await page.locator('.sheet th button', { hasText: 'Tasks' }).click();
  const firstDay = await page.locator('.sheet tbody tr').first().locator('td').first().textContent();
  log('sheet sorted, first row', firstDay.trim());
  await page.locator('.plan input[type=checkbox]').first().check();
  await page.waitForFunction(() => aegis.canvas.board.cards.find(c => c.kind === 'plan').data.steps[0].done === true, null, { timeout: 5000 });
  log('plan step ticked and saved through object_set');
  await page.screenshot({ path: out(`objects-${theme}-sheet.png`) });
  // Existing features still there.
  log('library rows', await page.locator('.tree-row').count(), 'layers rows', await page.locator('.layer-row').count(), 'tools', await page.locator('#tools [data-tool]').count());
  // Live update: edit Reply.svelte on disk, check it lands without a reload and the board and camera stay.
  const { readFileSync, writeFileSync } = await import('node:fs');
  const file = repo + '/app/src/objects/kinds/Reply.svelte';
  const original = readFileSync(file, 'utf8');
  await page.evaluate(() => { window.__marker = 'still-here'; });
  const viewBefore = await page.evaluate(() => JSON.stringify(aegis.canvas.view));
  const t0 = Date.now();
  writeFileSync(file, original.replace('font-weight: 650; line-height: 1.18;', 'font-weight: 650; line-height: 1.18; color: rgb(255, 0, 128);'));
  try {
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.reply h2')).color === 'rgb(255, 0, 128)', null, { timeout: 10000 });
    log('live edit landed in', Date.now() - t0, 'ms; no reload', await page.evaluate(() => window.__marker === 'still-here'), '; camera kept', viewBefore === await page.evaluate(() => JSON.stringify(aegis.canvas.view)), '; objects', await page.evaluate(() => document.querySelectorAll('.card.object .object').length));
  } finally { writeFileSync(file, original); }
  await page.waitForTimeout(800);
} catch (e) { errors.push('script: ' + e.message); await page.screenshot({ path: out('objects-fail.png') }); }
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no page errors');
await b.close(); host.kill(); vite.kill();
