// @ts-nocheck -- moved from the plain-JS app as it was; new code lives in typed modules beside it.
// Aegis app: boards, composer, agents and settings, talking to the local agent host.
import { mountAgents } from './features/agents/index.js';
// PM6 finding 1: GET and event updates share one per-agent ordering gate.
import { createAgentState } from './features/agents/state.js';
import { defaultStatusModel, modelChoice, modelValue } from './features/agents/models.js';
import { createCanvas } from './canvas/engine.js';
import { applyBatch } from './lib/board/commands.js';
import { connect as connectHost } from './lib/host';
import { mountObjects } from './objects/mount';
// PM4 saving feedback: publish the existing queue state to generated views.
import { objectSaveState } from './objects/save-state.js';
// End PM4 saving feedback.
import * as registry from './features/registry';
import './features/index';
// round2-sidebar: shortcut copy comes from the shared display map.
import { shortcutText } from './lib/shortcuts.js';
import { createMenu } from './chrome/menu.js';
import { createPanels } from './chrome/panels.js';
import { createLibrary } from './chrome/library.js';
import { createLayers } from './chrome/layers.js';
import { mountEditing } from './features/editing/main.js';
import { mountMobile } from './features/mobile/index.js';
import { mountSettings } from './features/settings/index.js';
import { repairBatch } from './features/settings/preferences.js';
import { createSaveQueue } from './features/settings/save.js';
import { createOnboarding } from './features/onboarding/index.js';
import { installNativeDownloads } from './lib/native-files';
// item 14: shared import hook, installed once the canvas context exists.
import { importFiles } from './features/media/imports.js';
import { installImports } from './features/imports';

export async function start() {
const $ = id => document.getElementById(id);
installNativeDownloads(message => toast(message));
const host = await connectHost(waiting => { $('status').textContent = waiting ? 'Starting Aegis…' : ''; });
if (!host) { document.body.innerHTML = '<p style="font:14px system-ui;padding:60px 40px">The Aegis agent host did not start. Quit Aegis and open it again.</p>'; return; }
const canvas = createCanvas({
  stage: $('stage'), world: $('world'), grid: $('grid'), links: $('links'), marquee: $('marquee'),
  onBatch: { apply: (commands, done) => apply(commands, done), view: v => host.post(`/boards/${canvas.board.id}/view`, { view: v }).catch(() => {}) },
  onSelect: ids => layers?.select(ids),
  onOpenUrl: url => host.openUrl(url).catch(e => toast(`Could not open the link: ${e?.message ?? e}`)),
  onPlace: (tool, at) => place(tool, at),
  pointerTool: id => { const t = registry.tools.find(x => x.id === id); return t?.pointer ? { down: (e, at) => t.pointer.down(e, at, ctx), move: (e, at) => t.pointer.move(e, at, ctx), up: (e, at) => t.pointer.up(e, at, ctx) } : null; },
  onContext: ({ x, y, at, ids }) => showContext(x, y, at, ids),
  resolveUrl: url => host.assetUrl(url),
  renderObject: (el, card) => objects.render(el, card),
  dropObject: el => objects.drop(el),
});
// Round 2 demo: rendered content sizes use the current board when repacking.
const objects = mountObjects({ host, apply: (commands) => apply(commands), getBoard: () => canvas.board });

// ---------- boards ----------
const saves = createSaveQueue({
  post: (id, commands) => host.post(`/boards/${id}/batch`, { commands }),
  reload: () => reloadBoard(),
  changed: state => { objectSaveState.set(state); $('saveState').textContent = state; $('retrySave').hidden = state !== 'not saved'; if (state === 'saved' && $('toast').textContent.startsWith('Could not save:')) $('toast').hidden = true; },
  failed: e => toast(`Could not save: ${e.message}. Your changes are kept here. Retry when ready.`),
});
$('retrySave').onclick = () => saves.retry();
async function openBoard(id) {
  await saves.settled;
  if (saves.pending) { toast('Retry saving your changes before opening another board.'); return; }
  const b = await host.get(`/boards/${id}`);
  canvas.setBoard(b); localStorage.setItem('aegis:board', id);
  $('boardName').textContent = b.name; refreshEmpty(); refreshAgents();
  library.render(); layers.update(); hideShow();
}
async function reloadBoard(focus) {
  if (saves.pending) return;
  const id = canvas.board.id;
  const b = await host.get(`/boards/${id}`);
  if (canvas.board.id !== id || saves.pending) return;
  if (b.rev <= canvas.board.rev && !focus) return;
  canvas.setBoard(b); refreshEmpty();
  if (focus?.ids?.length) followTo(focus.ids);
}
function refreshEmpty() { $('empty').hidden = canvas.board.cards.length > 0; layers?.update(); }
// Local first: apply the batch on screen at once, then commit; the host's answer wins.
function apply(commands, done) {
  commands = repairBatch(canvas.board, commands);
  for (const c of commands) if (c.op === 'create' && !c.newId) c.newId = Math.random().toString(36).slice(2, 12).padEnd(8, '0');
  const local = applyBatch(canvas.board, { commands });
  if (!local.ok) { toast(local.errors[0].reason); return; }
  canvas.setBoard(local.board); refreshEmpty();
  const id = canvas.board.id;
  saves.add(id, commands);
  if (done) done(local.created);
}
document.addEventListener('board-renamed', e => { $('boardName').textContent = e.detail; canvas.board.name = e.detail; });

// ---------- side bar, layers, library ----------
// A feature panel joins the side bar as another foldable box.
const mountedPanels = new Set();
function mountPanel(p) {
  if (mountedPanels.has(p.id)) return; mountedPanels.add(p.id);
  const box = document.createElement('section'); box.className = 'pbox'; box.dataset.panel = p.id;
  box.innerHTML = `<div class="phead"><span></span><button class="fold" aria-label="Fold"><svg viewBox="0 0 10 10"><path d="M2 5h6"/><path class="v" d="M5 2v6"/></svg></button></div><div class="pbody"></div><div class="resize-handle" title="Drag to resize"></div>`;
  box.querySelector('.phead span').textContent = p.title;
  $('side').insertBefore(box, $('side').querySelector('.side-resize'));
  box.querySelector('.fold').onclick = () => box.classList.toggle('folded');
  p.mount(box.querySelector('.pbody'), ctx);
}
const panels = createPanels({ side: $('side'), onChange: st => $('sideBtn').setAttribute('aria-pressed', String(st.open.left)) });
$('sideBtn').onclick = e => panels.toggle('left', e.detail === 0);
$('boardName').onclick = e => panels.toggle('left', e.detail === 0);
const library = createLibrary({ el: document.querySelector('[data-panel="library"]'), host, current: () => canvas.board?.id, openBoard, toast });
addEventListener('focus', () => { library.refresh().catch(e => toast(e.message)); });
const layers = createLayers({
  el: document.querySelector('[data-panel="layers"]'), count: $('layerCount'), getBoard: () => canvas.board,
  onPick: (id, add) => { canvas.select(add ? canvas.selection().includes(id) ? canvas.selection().filter(key => key !== id) : [...canvas.selection(), id] : [id]); if (!add) canvas.frameIds([id], canvas.view.z); },
  onUpdate: commands => apply(commands),
  onOrder: (id, to) => apply([{ op: 'order', ids: [id], to }]),
});

// ---------- following agents ----------
// On: glide to what an agent made, unless you're mid-drag or typed in the last moment. Off: offer a Show chip.
let follow = localStorage.getItem('aegis:follow') !== 'off', lastTouch = 0, pendingFocus = null;
const touched = () => { lastTouch = performance.now(); };
for (const t of ['pointerdown', 'wheel', 'keydown']) addEventListener(t, touched, { capture: true, passive: true });
function setFollow(on) {
  follow = on; localStorage.setItem('aegis:follow', on ? 'on' : 'off');
  $('followBtn').setAttribute('aria-checked', String(on));
  if (on && pendingFocus) { const ids = pendingFocus; hideShow(); followTo(ids, true); }
}
// PM6.3: describe the pending result through its agent and window count.
function followTo(ids, force = false, agentId) {
  ids = ids.filter(id => canvas.board.cards.some(c => c.id === id)); if (!ids.length) return;
  if (force || (follow && !canvas.busy() && performance.now() - lastTouch > 1500)) {
    // Round 3 agents: frame the result together with its spatial agent windows.
    canvas.frameIds(ids, 1, true); setTimeout(() => canvas.glow(ids), 450); return;
  }
  const who = agentState.get(agentId);
  $('showChip').setAttribute('aria-description', `${who ? `Show what ${agentUi.nameOf(who)} changed` : 'Show changes'}: ${ids.length} ${ids.length === 1 ? 'window' : 'windows'}`);
  pendingFocus = ids; $('showChip').hidden = false; canvas.glow(ids);
}
// End PM6.3.
function hideShow() { pendingFocus = null; $('showChip').hidden = true; }
$('followBtn').onclick = () => setFollow(!follow);
$('showChip').onclick = () => { const ids = pendingFocus; hideShow(); if (ids) followTo(ids, true); };

// ---------- tools ----------
const TOOL_KEYS = { v: 'select', n: 'note', h: 'title', c: 'todo', r: 'readme', l: 'link', m: 'media' };
const TOOL_NAMES = { note: 'Note', title: 'Heading', todo: 'Checklist', readme: 'Read me', link: 'Link' };
const CORE_TOOLS = ['select', 'note', 'title', 'todo', 'doc', 'deck', 'draw-ink', 'draw-shape', 'media'];
const toolHomes = new Map();
function foldTools(closed, focus = false) {
  const dock = $('tools'), popover = $('toolsPopover'), trigger = $('toolsFold');
  if (closed) {
    const hadFocus = popover.contains(document.activeElement);
    for (const [button, home] of toolHomes) home.replaceWith(button);
    toolHomes.clear(); popover.replaceChildren(); popover.hidden = true;
    dock.classList.remove('more-open'); trigger.setAttribute('aria-expanded', 'false');
    if (focus || hadFocus) trigger.focus({ preventScroll: true });
    return;
  }
  // Four groups by what you are about to do, so no heading sits over a single tool.
  const SECTION = { write: 'Create', design: 'Create', basics: 'Create', media: 'Media', files: 'Media', draw: 'Draw', library: 'Board', editing: 'Board' };
  const ORDER = ['Create', 'Media', 'Draw', 'Board'];
  const groups = new Map(ORDER.map(name => {
    const section = document.createElement('section'), heading = document.createElement('h3'), grid = document.createElement('div');
    heading.textContent = name; grid.className = 'tools-grid'; section.append(heading, grid); popover.append(section);
    return [name, grid];
  }));
  for (const button of dock.querySelectorAll(':scope > [data-tool]:not([data-core])')) {
    if (button.hidden) continue;
    const feature = registry.tools.find(t => t.id === button.dataset.tool);
    const group = SECTION[String(feature?.group || 'basics').toLowerCase()] ?? 'Board';
    // Restore the same nodes and ordering for the existing toolbar customiser and phone hub.
    const home = document.createComment('tool home'); button.before(home); toolHomes.set(button, home);
    button.dataset.customised = '1'; groups.get(group).append(button);
  }
  // fix1: notes use the island's existing action without adding another pill control.
  const notes = document.createElement('button'); notes.type = 'button'; notes.title = `Add as notes (${shortcutText('addNotes')})`;
  notes.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h6l3 3v8h-9zM9.5 2.5v3h3M5.5 8h5M5.5 10.5h5"/></svg><span class="tools-label">Add as notes</span>';
  notes.onclick = () => { foldTools(true); $('composer').dispatchEvent(new Event('add-as-notes')); };
  groups.get('Create').append(notes);
  // end fix1
  // Imports sit together at the end of Media.
  const media = groups.get('Media');
  for (const id of ['import-files', 'import-image']) { const b = media.querySelector(`[data-tool="${id}"]`); if (b) media.append(b); }
  for (const [name, grid] of groups) if (!grid.children.length) grid.parentElement.remove(); else grid.parentElement.dataset.group = name.toLowerCase();
  const customise = document.createElement('button'); customise.className = 'tools-customise'; customise.type = 'button';
  customise.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7"/><circle cx="11" cy="4.5" r="1.5"/><circle cx="5" cy="11.5" r="1.5"/></svg><span>Customise toolbar</span>';
  customise.onclick = () => { foldTools(true); dock.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); };
  popover.append(customise); popover.hidden = false; popover.classList.toggle('instant', focus); dock.classList.add('more-open'); trigger.setAttribute('aria-expanded', 'true');
  if (focus) popover.querySelector('[data-tool]')?.focus({ preventScroll: true });
}
function pickTool(t) {
  if (t === 'media') { $('mediaFile').click(); t = 'select'; }
  const feature = registry.tools.find(x => x.id === t);
  if (feature?.activate) feature.activate(ctx);
  else canvas.setTool(t === 'select' ? null : t);
  foldTools(true);
}
$('stage').addEventListener('tool', e => {
  const t = e.detail ?? 'select';
  for (const b of $('tools').querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  $('tools').classList.toggle('armed', t !== 'select');
  document.body.classList.toggle('placing', !!e.detail);
});
$('tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) pickTool(b.dataset.tool); });
function drawFeatureTools() {
  foldTools(true);
  const dock = $('tools'), more = $('toolsFold');
  dock.querySelectorAll('[data-feature]').forEach(b => b.remove());
  for (const t of registry.tools) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.tool = t.id; b.dataset.feature = '1';
    if (CORE_TOOLS.includes(t.id)) b.dataset.core = 'true';
    const name = t.title.replace(/\s*\([^)]*\)$/, ''), key = t.key?.toUpperCase() || /\(([^)]+)\)$/.exec(t.title)?.[1];
    b.title = key ? `${name} (${key})` : name; b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', 'false');
    if (key) b.setAttribute('aria-keyshortcuts', key);
    b.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${t.icon}</svg>`;
    const label = document.createElement('span'); label.className = 'tools-label'; label.textContent = name; b.append(label);
    if (key) { const hint = document.createElement('kbd'); hint.textContent = key; b.append(hint); }
    more.before(b);
  }
  for (const b of dock.querySelectorAll(':scope > [data-tool]:not([data-feature])')) {
    if (b.querySelector('.tools-label')) continue;
    const label = document.createElement('span'); label.className = 'tools-label'; label.textContent = b.title.replace(/\s*\([^)]*\)$/, '');
    const key = Object.keys(TOOL_KEYS).find(key => TOOL_KEYS[key] === b.dataset.tool)?.toUpperCase();
    b.setAttribute('aria-label', b.title); if (key) b.setAttribute('aria-keyshortcuts', key);
    b.append(label); if (key) { const hint = document.createElement('kbd'); hint.textContent = key; b.append(hint); }
  }
}
registry.onRegistryChange(drawFeatureTools);
$('toolsFold').onclick = e => foldTools(!$('toolsPopover').hidden, e.detail === 0);
$('tools').addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('toolsPopover').hidden) { e.preventDefault(); e.stopPropagation(); foldTools(true, true); }
});
addEventListener('pointerdown', e => { if (!$('tools').contains(e.target)) foldTools(true); }, true);
$('tools').addEventListener('focusout', e => { if (e.relatedTarget && !$('tools').contains(e.relatedTarget)) foldTools(true); });
$('tools').addEventListener('contextmenu', () => foldTools(true), true);
addEventListener('resize', () => foldTools(true));
// Place the armed tool where you clicked, then put the caret in it.
function place(tool, at) {
  const feature = registry.tools.find(t => t.id === tool);
  if (feature?.place) { if (feature.place(at, ctx) === true) canvas.setTool(tool); return; }
  const x = Math.round(at.x), y = Math.round(at.y);
  const spec = {
    note: { type: 'note', x: x - 110, y: y - 30 },
    title: { type: 'title', x: x - 20, y: y - 28 },
    todo: { type: 'todo', x: x - 130, y: y - 30, items: [] },
    readme: { type: 'note', x: x - 120, y: y - 40, w: 260, h: 150, color: 'green', heading: 'How this board works', badge: 'read me first' },
    link: { type: 'link', x: x - 130, y: y - 38 },
  }[tool];
  if (!spec) return;
  apply([{ op: 'create', text: '', ...spec, ref: 'n' }, { op: 'order', ids: ['$n'], to: 'front' }], created => { canvas.select([created.n]); canvas.edit(created.n); });
}

// item 14: media, documents and presentations share the same drop/paste path.
async function addMedia(files, at) {
  if (!files.length) return false;
  await importFiles(ctx, files, at);
  return true;
}
$('mediaFile').onchange = async e => { await addMedia(e.target.files); e.target.value = ''; };
const stageEl = $('stage');
stageEl.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); stageEl.classList.add('dropping'); } });
stageEl.addEventListener('dragleave', e => { if (!stageEl.contains(e.relatedTarget)) stageEl.classList.remove('dropping'); });
stageEl.addEventListener('drop', e => {
  stageEl.classList.remove('dropping'); if (!e.dataTransfer.files.length) return; e.preventDefault();
  const v = canvas.view; addMedia(e.dataTransfer.files, { x: (e.clientX - v.x) / v.z, y: (e.clientY - v.y) / v.z });
});
addEventListener('paste', async e => {
  if (e.defaultPrevented || e.target.closest?.('textarea, input, [contenteditable]')) return;
  if (e.clipboardData.files.length && await addMedia(e.clipboardData.files)) { e.preventDefault(); return; }
  const text = e.clipboardData.getData('text/plain').trim();
  if (/^https?:\/\/\S+$/.test(text)) {
    e.preventDefault(); const c = canvas.centre();
    const isImg = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(text);
    apply([{ op: 'create', type: isImg ? 'image' : 'link', url: text, x: Math.round(c.x - 130), y: Math.round(c.y - 40), ref: 'l' }, { op: 'order', ids: ['$l'], to: 'front' }]);
  }
});
// end item 14

// ---------- composer ----------
const promptEl = $('prompt');
// Round 2 agents: make a request Undo a distinct, reversible board history step.
const agentUi = mountAgents({ canvas, host, toast, showAll: () => showAgents(true),
  beforeUndo: async () => { await saves.settled; if (saves.pending) throw new Error('Save your changes before undoing this request.'); editing.history.flush(); },
  afterUndo: async () => { await boardEvents; editing.history.flush(); },
});
const openComposer = agentUi.open, closeComposer = agentUi.close;
let forceNewAgent = false;
let composerViaKey = false;
promptEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addNotes(); }
  else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composerViaKey = true; forceNewAgent = e.altKey; $('composer').requestSubmit(); }
});
$('composer').addEventListener('add-as-notes', addNotes);
$('send').addEventListener('click', e => { composerViaKey = e.detail === 0; forceNewAgent = e.altKey; });
// Each line (or paragraph) becomes a note, laid out near the middle of the view.
function addNotes() {
  const lines = promptEl.value.split(/\n{2,}|\n(?=[-*•]\s)|\n/).map(s => s.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
  if (!lines.length) return;
  const c = canvas.centre();
  const commands = lines.map((text, i) => ({ op: 'create', type: /^https?:\/\/\S+$/.test(text) ? 'link' : 'note', text: /^https?:\/\//.test(text) ? '' : text, url: /^https?:\/\/\S+$/.test(text) ? text : undefined, ref: 'n' + i }));
  commands.push({ op: 'layout', ids: lines.map((_, i) => '$n' + i), shape: 'grid', cols: Math.min(4, lines.length), x: Math.round(c.x - 380), y: Math.round(c.y - 120) });
  apply(commands);
  promptEl.value = ''; promptEl.dispatchEvent(new Event('input')); closeComposer(true);
}
$('composer').addEventListener('submit', async e => {
  e.preventDefault();
  if ($('send').disabled) return;
  const brief = promptEl.value.trim() || 'Sort this board into clear groups.';
  const current = !forceNewAgent && !agentUi.wantsNew() && Number($('count').value) === 1 ? agentUi.current() : null;
  forceNewAgent = false;
  const { provider, modelId } = current?.model ?? modelChoice($('model').value);
  if (provider !== 'fake' && !(await host.get('/auth'))[provider]?.connected) {
    toast(`Sign in to ${provider === 'openai' ? 'ChatGPT' : 'Claude'} first`); settings.select('accounts'); renderAccounts(); $('settings').showModal(); return;
  }
  const count = Math.min(8, Math.max(1, Number($('count').value) || 1));
  // fix1: selection is host context, separate from the person's words.
  const selectedIds = agentUi.takeContext();
  $('send').disabled = true;
  const draft = promptEl.value;
  if (!current) agentUi.starting();
  promptEl.value = ''; promptEl.dispatchEvent(new Event('input')); closeComposer(composerViaKey);
  try {
    if (current) await host.post(`/agents/${current.id}/message`, { content: brief, selectedIds });
    else {
      const spawned = await host.post('/agents', { boardId: canvas.board.id, brief, selectedIds, model: { provider, modelId }, statusModel: modelChoice(localStorage.getItem('aegis:status-model')), count });
      agentUi.sent(spawned[0]?.id);
    }
    // end fix1
    await refreshAgents();
  } catch (err) {
    if (!promptEl.value) { promptEl.value = draft; openComposer(true); }
    toast(err.message);
  }
  finally { $('send').disabled = false; }
});
async function loadModels() {
  const list = await host.get('/models'); const auth = await host.get('/auth');
  const sel = $('model'); const saved = localStorage.getItem('aegis:model'); sel.innerHTML = '';
  for (const m of list) {
    const o = document.createElement('option'); o.value = `${m.provider}|${m.modelId}`;
    const ready = m.provider === 'fake' || auth[m.provider]?.connected;
    // PM4.7: provider availability is group copy, with status retained per choice.
    o.textContent = m.name;
    o.dataset.group = ({ openai: 'OpenAI', anthropic: 'Anthropic', fake: 'Review' })[m.provider] || m.provider;
    o.dataset.groupDescription = ready ? (m.provider === 'fake' ? 'Available' : 'Signed in') : 'Sign in required';
    o.setAttribute('aria-description', o.dataset.groupDescription); sel.appendChild(o);
  }
  const firstReady = list.find(m => m.provider === 'fake' || auth[m.provider]?.connected);
  sel.value = saved && [...sel.options].some(o => o.value === saved) ? saved : firstReady ? `${firstReady.provider}|${firstReady.modelId}` : sel.options[0]?.value;
  sel.onchange = () => localStorage.setItem('aegis:model', sel.value);
  const status = localStorage.getItem('aegis:status-model');
  if (!list.some(m => modelValue(m) === status)) {
    const choice = defaultStatusModel(list, m => m.provider === 'fake' || auth[m.provider]?.connected);
    if (choice) localStorage.setItem('aegis:status-model', modelValue(choice));
  }
  document.dispatchEvent(new Event('aegis-models'));
}

// ---------- agents ----------
const agentState = createAgentState();
// Round 2 agents: identity comes from names and line styles, always in data blue.
const lineStyleOf = id => ['solid', 'dashed', 'dotted'][[...String(id)].reduce((n, c) => n + c.charCodeAt(0), 0) % 3];
function showAgents(on, instant = false) { $('agentsPanel').hidden = false; panels.setOpen('right', on, instant); $('agentsBtn').setAttribute('aria-pressed', String(on)); }
$('agentsBtn').onclick = e => showAgents(!panels.isOpen('right'), e.detail === 0);
$('closeAgents').onclick = () => showAgents(false);
async function refreshAgents() {
  const read = agentState.beginRead();
  for (const a of await host.get(`/agents?board=${canvas.board.id}`)) agentState.mergeSnapshot(a, read);
  renderAgents();
}
function renderAgents() {
  const list = $('agentList');
  const mine = [...agentState.values()].filter(a => a.boardId === canvas.board.id).reverse();
  const running = mine.filter(a => a.running).length;
  $('agentCount').hidden = !running; $('agentCount').textContent = running;
  $('status').textContent = running ? `${running} agent${running > 1 ? 's' : ''} working` : '';
  $('runStrip').hidden = true;
  agentUi.update(mine);
  agentUi.renderList(list, mine);
}

// ---------- live events ----------
// item 10: committed diffs arrive in revision order. Only a gap/reconnect needs a full read.
let boardEvents = Promise.resolve(), libraryRefreshTimer = 0;
async function agentBoardEvent(ev) {
  if (ev.boardId !== canvas.board?.id) return;
  if (saves.pending) await saves.settled;
  if (canvas.busy()) await new Promise(resolve => {
    const stage = $('stage');
    const done = () => { stage.removeEventListener('pointerup', done); stage.removeEventListener('pointercancel', done); resolve(); };
    stage.addEventListener('pointerup', done); stage.addEventListener('pointercancel', done);
  });
  if (ev.boardId !== canvas.board?.id || saves.pending) return;
  if (ev.rev <= canvas.board.rev) return;
  const focus = ev.focus && Date.now() - ev.focus.at < 5000 ? ev.focus : null;
  if (ev.patch && ev.baseRev === canvas.board.rev) {
    const removed = new Set(ev.patch.removed), changed = new Map(ev.patch.cards.map(c => [c.id, c]));
    const cards = canvas.board.cards.filter(c => !removed.has(c.id)).map(c => {
      const next = changed.get(c.id); changed.delete(c.id); return next ?? c;
    });
    cards.push(...changed.values());
    const byId = ev.patch.order && new Map(cards.map(c => [c.id, c]));
    const next = { ...canvas.board, rev: ev.rev, focus: ev.focus, cards: byId ? ev.patch.order.map(id => byId.get(id)).filter(Boolean) : cards, links: ev.patch.links ?? canvas.board.links };
    for (const [key, value] of Object.entries(ev.patch.fields)) { if (value === null) delete next[key]; else next[key] = value; }
    canvas.setBoard(next, { animate: true, agentIds: [...ev.patch.cards.map(c => c.id), ...ev.patch.removed] }); refreshEmpty();
  } else await reloadBoard();
  // Round 3 agents: place the window before calculating the result's camera bounds.
  if (!ev.author.undoRequest && ev.touched?.length) agentUi.near(ev.author.conversationId, ev.touched);
  // PM6.3: keep the result's agent identity with the pending action.
  if (focus?.ids?.length) followTo(focus.ids, false, ev.author.conversationId);
  clearTimeout(libraryRefreshTimer); libraryRefreshTimer = setTimeout(() => library.refresh(), 200);
  // Round 2 agents: undo clears stale lines; all other changes use the one blue.
  if (ev.author.undoRequest) { canvas.clearAgentLine(); editing.history.flush(); }
  else if (ev.touched?.length) {
    const who = agentState.get(ev.author.conversationId);
    const name = ev.author.kind === 'mcp' ? ev.author.name : who ? agentUi.nameOf(who) : 'Agent';
    canvas.ring(ev.touched, 'var(--data)', 4000, `${name}: ${who?.title || who?.brief?.split('\n')[0]?.replace(/^FAKE(?:TOOLS)?[\s\S]*/, 'Board assistant').slice(0, 60) || 'changed the board'}`, agentUi.origin(ev.author.conversationId), lineStyleOf(ev.author.conversationId));
  }
}
// end item 10
function listen() {
  const es = host.events();
  es.onmessage = async m => {
    const ev = JSON.parse(m.data);
    if (ev.type === 'board' && ev.boardId === canvas.board?.id && ['agent', 'mcp'].includes(ev.author?.kind)) {
      // item 10: serialise board revisions without blocking streamed agent status messages.
      boardEvents = boardEvents.then(() => agentBoardEvent(ev)).catch(e => toast(`Could not update the board: ${e.message}`));
      // end item 10
    }
    if (ev.type === 'agent' && agentState.mergeEvent(ev)) renderAgents();
    if (ev.type === 'auth') { renderAccounts(); loadModels(); }
    if (ev.type === 'library') library.refresh();
  };
  // item 10: SSE has no replay buffer, so reconcile once after reconnecting.
  es.onopen = () => {
    boardEvents = boardEvents.then(() => reloadBoard()).catch(() => {});
    refreshAgents().catch(() => {});
  };
  es.onerror = () => { es.close(); setTimeout(listen, 1500); };
  // end item 10
}

// ---------- settings ----------
$('settingsBtn').onclick = () => { renderAccounts(); $('settings').showModal(); };
$('closeSettings').onclick = () => $('settings').close();
const opened = new Map(); // provider -> link already opened in the browser
async function renderAccounts() {
  const auth = await host.get('/auth');
  for (const row of document.querySelectorAll('.account')) {
    const p = row.dataset.provider, s = auth[p], name = p === 'openai' ? 'ChatGPT' : 'Claude';
    const state = row.querySelector('.acct-state'), btn = row.querySelector('.acct-btn'), flow = row.querySelector('.acct-flow');
    const pending = s.state === 'pending';
    state.className = 'acct-state' + (s.connected ? ' ok' : s.error ? ' bad' : '');
    state.textContent = s.connected ? 'Connected' : pending ? (s.progress ?? 'Waiting for you to approve in the browser…') : s.error ?? 'Not connected';
    btn.textContent = s.connected ? 'Sign out' : pending ? 'Cancel' : s.error ? 'Try again' : 'Sign in';
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        if (s.connected) await host.post('/auth/logout', { provider: p });
        else if (pending) await host.post('/auth/cancel', { provider: p });
        else await host.post('/auth/start', { provider: p });
      } catch (e) { toast(e.message); }
      btn.disabled = false; renderAccounts(); loadModels();
    };
    // Open the provider's page once per attempt, as soon as the link exists.
    if (pending && s.link && opened.get(p) !== s.link) { opened.set(p, s.link); host.openUrl(s.link); }
    flow.hidden = !(pending && s.link);
    if (!flow.hidden) {
      flow.querySelector('.acct-help').textContent = `A ${name} sign-in page opened in your browser. Approve it there and this updates by itself. If the browser shows an error or a code instead, paste the address or code below.`;
      flow.querySelector('.acct-open').onclick = () => host.openUrl(s.link);
      flow.querySelector('.acct-copy').onclick = () => host.copy(s.link).then(() => toast('Link copied'), () => toast('Could not copy'));
      const input = flow.querySelector('input'); input.placeholder = s.prompt?.placeholder ?? '';
      flow.querySelector('.acct-paste').hidden = !s.prompt;
      flow.querySelector('.acct-paste').onsubmit = async e => {
        e.preventDefault(); const answer = input.value.trim(); if (!answer) return;
        try { await host.post('/auth/answer', { provider: p, answer }); input.value = ''; } catch (err) { toast(err.message); }
        renderAccounts();
      };
    }
  }
}
function applyTheme(v) {
  localStorage.setItem('aegis:theme', v);
  const dark = v === 'dark' || (v === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  for (const b of $('theme').children) b.setAttribute('aria-checked', String(b.dataset.v === v));
}
$('theme').onclick = e => { const v = e.target.closest('button')?.dataset.v; if (v) { applyTheme(v); canvas.setBoard(canvas.board); } };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(localStorage.getItem('aegis:theme') || 'dark'));

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200); }
addEventListener('keydown', e => {
  if (e.defaultPrevented || e.target.closest?.('textarea, input, [contenteditable], select')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) { if (e.key === '/') { e.preventDefault(); openComposer(true); } return; }
  if (e.key === 'a') showAgents(!panels.isOpen('right'), true);
  if (e.key.toLowerCase() === 'f' && e.shiftKey) setFollow(!follow);
  if (e.key === '\\') panels.toggle('left', true);
  if (TOOL_KEYS[e.key]) pickTool(TOOL_KEYS[e.key]);
  else { const t = registry.tools.find(x => x.key === e.key); if (t) pickTool(t.id); }
  if (e.key === '/') { e.preventDefault(); openComposer(true); }
});

// ---------- feature context: what features may use ----------
addEventListener('keydown', e => {
  if (e.defaultPrevented || document.querySelector('dialog[open]') || e.target.closest?.('textarea, input, [contenteditable], select')) return;
  // Round 3 navigation: plain brackets always toggle panels, including with a selection.
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && ['BracketLeft', 'BracketRight'].includes(e.code)) {
    e.preventDefault(); e.stopImmediatePropagation(); panels.toggle(e.code === 'BracketLeft' ? 'left' : 'right', true);
  }
}, true);
const ctx = { apply: (c, done) => apply(c, done), canvas, host, toast: m => toast(m), selection: () => canvas.selection() };
window.aegisCtx = ctx;
// item 14 / 15: importer state and original motion assets, isolated from the chrome.
installImports(ctx);
// end item 14 / 15
const editing = mountEditing(ctx);
// Right-click: feature menu items for the cards under the pointer, or the board's own items on empty canvas.
const menu = createMenu();
function showContext(x, y, at, ids) {
  const list = ids.length ? registry.cardMenu : registry.boardMenu;
  const items = list.filter(m => !m.when || m.when(ctx, ids));
  const builtIn = ids.length ? [
    { id: 'front', title: 'Bring to front', shortcut: shortcutText('stackToFront'), section: 'Arrange', run: () => apply([{ op: 'order', ids, to: 'front' }]) },
    { id: 'back', title: 'Send to back', shortcut: shortcutText('stackToBack'), section: 'Arrange', run: () => apply([{ op: 'order', ids, to: 'back' }]) },
    { id: 'delete', title: 'Delete', section: 'zz', run: () => apply([{ op: 'delete', ids }]) },
  ] : [
    { id: 'note', title: 'New note here', section: 'Add', run: () => place('note', at) },
    { id: 'fit', title: 'Zoom to fit', section: 'View', run: () => canvas.fit() },
  ];
  menu.show(x, y, [...items, ...builtIn].map(m => ({ ...m, run: () => m.run(ctx, ids, at) })));
}
addEventListener('keydown', e => {
  if (e.target.closest?.('textarea, input, [contenteditable], select')) return;
  // R3 merge: let focused controls handle their own native activation keys.
  if (['Enter', ' '].includes(e.key) && e.target.closest?.('button, summary, a, [role="button"], [role="combobox"]')) return;
  const combo = `${e.metaKey || e.ctrlKey ? 'mod+' : ''}${e.shiftKey ? 'shift+' : ''}${e.altKey ? 'alt+' : ''}${e.key.toLowerCase()}`;
  const c = registry.commands.find(x => x.keys === combo && (!x.when || x.when(ctx)));
  if (c) { e.preventDefault(); e.stopImmediatePropagation(); c.run(ctx); }
}, true);

// ---------- start ----------
applyTheme(localStorage.getItem('aegis:theme') || 'dark');
setFollow(follow);
drawFeatureTools();
for (const p of registry.panels) mountPanel(p);
registry.onRegistryChange(() => { for (const p of registry.panels) mountPanel(p); });
const benchCount = Number(new URLSearchParams(location.search).get('bench'));
if (benchCount) { (await import('./canvas/bench.js')).bench(canvas, benchCount); return; }
let boards = await host.get('/boards');
if (!boards.length) boards = [await host.post('/boards', { name: 'First board' })];
const saved = localStorage.getItem('aegis:board');
await library.refresh();
await openBoard(boards.some(b => b.id === saved) ? saved : boards[0].id);
await loadModels();
listen();
const mobile = mountMobile({ pickTool, tools: registry.tools, showAgents });
const onboarding = createOnboarding({ mobile, panels, openComposer, closeComposer });
const settings = mountSettings({ canvas, host, toast, replayTour: () => onboarding.welcome() });
window.aegis = { canvas, host, apply, editing };
onboarding.firstRun();
// Loaded from the host (an installed UI), say plainly if the native bridge is missing.
if (location.protocol === 'http:' && location.pathname.startsWith('/ui/')) host.bridge().then(r => { document.documentElement.dataset.bridge = r; if (r !== 'ok') toast(`Native bridge: ${r}`); });
}
