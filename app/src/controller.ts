// @ts-nocheck -- moved from the plain-JS app as it was; new code lives in typed modules beside it.
// Aegis app: boards, composer, agents and settings, talking to the local agent host.
import { createCanvas } from './canvas/engine.js';
import { applyBatch } from './lib/board/commands.js';
import { connect as connectHost } from './lib/host';
import { mountObjects } from './objects/mount';
import { createPanels } from './chrome/panels.js';
import { createLibrary } from './chrome/library.js';
import { createLayers } from './chrome/layers.js';

export async function start() {
const $ = id => document.getElementById(id);
const host = await connectHost(waiting => { $('status').textContent = waiting ? 'Starting Aegis…' : ''; });
if (!host) { document.body.innerHTML = '<p style="font:14px system-ui;padding:60px 40px">The Aegis agent host did not start. Quit Aegis and open it again.</p>'; return; }
const canvas = createCanvas({
  stage: $('stage'), world: $('world'), grid: $('grid'), links: $('links'), marquee: $('marquee'),
  onBatch: { apply: (commands, done) => apply(commands, done), view: v => host.post(`/boards/${canvas.board.id}/view`, { view: v }).catch(() => {}) },
  onSelect: ids => layers?.select(ids),
  onOpenUrl: url => host.openUrl(url).catch(e => toast(`Could not open the link: ${e?.message ?? e}`)),
  onPlace: (tool, at) => place(tool, at),
  resolveUrl: url => host.assetUrl(url),
  renderObject: (el, card) => objects.render(el, card),
  dropObject: el => objects.drop(el),
});
const objects = mountObjects({ host, apply: (commands) => apply(commands) });

// ---------- boards ----------
let pending = Promise.resolve();
async function openBoard(id) {
  const b = await host.get(`/boards/${id}`);
  canvas.setBoard(b); localStorage.setItem('aegis:board', id);
  $('boardName').textContent = b.name; refreshEmpty(); refreshAgents();
  library.render(); layers.update(); hideShow();
}
async function reloadBoard(focus) {
  const b = await host.get(`/boards/${canvas.board.id}`);
  if (b.rev <= canvas.board.rev && !focus) return;
  canvas.setBoard(b); refreshEmpty();
  if (focus?.ids?.length) followTo(focus.ids);
}
function refreshEmpty() { $('empty').hidden = canvas.board.cards.length > 0; layers?.update(); }
// Local first: apply the batch on screen at once, then commit; the host's answer wins.
function apply(commands, done) {
  for (const c of commands) if (c.op === 'create' && !c.newId) c.newId = Math.random().toString(36).slice(2, 12).padEnd(8, '0');
  const local = applyBatch(canvas.board, { commands });
  if (!local.ok) { toast(local.errors[0].reason); return; }
  canvas.setBoard(local.board); refreshEmpty();
  const id = canvas.board.id;
  // The host repeats the same ids only by chance, so trust the server's board on any refusal.
  pending = pending.then(() => host.post(`/boards/${id}/batch`, { commands })).then(r => {
    if (!r.ok) { toast(r.errors?.[0]?.reason ?? 'That change was refused'); return reloadBoard(); }
    return reloadBoard();
  }).catch(e => { toast(e.message); reloadBoard(); });
  if (done) done(local.created);
}
document.addEventListener('board-renamed', e => { $('boardName').textContent = e.detail; canvas.board.name = e.detail; });

// ---------- side bar, layers, library ----------
const panels = createPanels({ side: $('side'), onChange: st => $('sideBtn').setAttribute('aria-pressed', String(!st.hidden)) });
$('sideBtn').onclick = () => panels.toggle();
const library = createLibrary({ el: document.querySelector('[data-panel="library"]'), host, current: () => canvas.board?.id, openBoard, toast });
const layers = createLayers({
  el: document.querySelector('[data-panel="layers"]'), count: $('layerCount'), getBoard: () => canvas.board,
  onPick: (id, add) => { canvas.select(add ? [...new Set([...canvas.selection(), id])] : [id]); if (!add) canvas.frameIds([id], canvas.view.z); },
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
function followTo(ids, force = false) {
  ids = ids.filter(id => canvas.board.cards.some(c => c.id === id)); if (!ids.length) return;
  if (force || (follow && !canvas.busy() && performance.now() - lastTouch > 1500)) {
    canvas.frameIds(ids); setTimeout(() => canvas.glow(ids), 450); return;
  }
  pendingFocus = ids; $('showChip').hidden = false; canvas.glow(ids);
}
function hideShow() { pendingFocus = null; $('showChip').hidden = true; }
$('followBtn').onclick = () => setFollow(!follow);
$('showChip').onclick = () => { const ids = pendingFocus; hideShow(); if (ids) followTo(ids, true); };

// ---------- tools ----------
const TOOL_KEYS = { v: 'select', n: 'note', h: 'title', c: 'todo', r: 'readme', l: 'link', m: 'media' };
const TOOL_NAMES = { note: 'Note', title: 'Heading', todo: 'Checklist', readme: 'Read me', link: 'Link' };
function pickTool(t) {
  if (t === 'media') { $('mediaFile').click(); t = 'select'; }
  canvas.setTool(t === 'select' ? null : t);
}
$('stage').addEventListener('tool', e => {
  const t = e.detail ?? 'select';
  for (const b of $('tools').querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  document.body.classList.toggle('placing', !!e.detail);
});
$('tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) pickTool(b.dataset.tool); });
const foldTools = on => { $('tools').classList.toggle('folded', on); $('toolsFold').setAttribute('aria-expanded', String(!on)); $('toolsFold').title = on ? 'Show tools' : 'Fold tools'; localStorage.setItem('aegis:tools', on ? 'folded' : ''); };
$('toolsFold').onclick = () => foldTools(!$('tools').classList.contains('folded'));
foldTools(localStorage.getItem('aegis:tools') === 'folded');
// Place the armed tool where you clicked, then put the caret in it.
function place(tool, at) {
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

// ---------- media: drop, paste or pick images and video ----------
async function addMedia(files, at) {
  files = [...files].filter(f => /^(image|video)\//.test(f.type)); if (!files.length) return false;
  at ??= canvas.centre();
  let dx = 0;
  for (const f of files) {
    try {
      toast(`Adding ${f.name || 'media'}…`);
      const size = await mediaSize(f); const { url } = await host.upload(f);
      const w = Math.round(Math.max(160, Math.min(480, size.w))), h = Math.round(w * size.h / size.w) + (f.type.startsWith('video') ? 30 : 0);
      apply([{ op: 'create', type: f.type.startsWith('video') ? 'video' : 'image', url, text: f.name?.replace(/\.[^.]+$/, '') ?? '', x: Math.round(at.x - w / 2 + dx), y: Math.round(at.y - h / 2), w, h, ref: 'm' }, { op: 'order', ids: ['$m'], to: 'front' }]);
      dx += w + 24;
    } catch (e) { toast(e.message); }
  }
  return true;
}
function mediaSize(file) {
  const url = URL.createObjectURL(file);
  return new Promise(resolve => {
    const done = (w, h) => { URL.revokeObjectURL(url); resolve(w && h ? { w, h } : { w: 480, h: 270 }); };
    if (file.type.startsWith('video')) { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight); v.onerror = () => done(); v.src = url; }
    else { const i = new Image(); i.onload = () => done(i.naturalWidth, i.naturalHeight); i.onerror = () => done(); i.src = url; }
  });
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
  if (e.target.closest?.('textarea, input, [contenteditable]')) return;
  if (e.clipboardData.files.length && await addMedia(e.clipboardData.files)) { e.preventDefault(); return; }
  const text = e.clipboardData.getData('text/plain').trim();
  if (/^https?:\/\/\S+$/.test(text)) {
    e.preventDefault(); const c = canvas.centre();
    const isImg = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(text);
    apply([{ op: 'create', type: isImg ? 'image' : 'link', url: text, x: Math.round(c.x - 130), y: Math.round(c.y - 40), ref: 'l' }, { op: 'order', ids: ['$l'], to: 'front' }]);
  }
});

// ---------- composer ----------
const promptEl = $('prompt');
promptEl.addEventListener('input', () => { promptEl.style.height = 'auto'; promptEl.style.height = Math.min(200, promptEl.scrollHeight) + 'px'; });
promptEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addNotes(); }
  else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); }
});
$('dumpBtn').onclick = addNotes;
// Each line (or paragraph) becomes a note, laid out near the middle of the view.
function addNotes() {
  const lines = promptEl.value.split(/\n{2,}|\n(?=[-*•]\s)|\n/).map(s => s.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
  if (!lines.length) return;
  const c = canvas.centre();
  const commands = lines.map((text, i) => ({ op: 'create', type: /^https?:\/\/\S+$/.test(text) ? 'link' : 'note', text: /^https?:\/\//.test(text) ? '' : text, url: /^https?:\/\/\S+$/.test(text) ? text : undefined, ref: 'n' + i }));
  commands.push({ op: 'layout', ids: lines.map((_, i) => '$n' + i), shape: 'grid', cols: Math.min(4, lines.length), x: Math.round(c.x - 380), y: Math.round(c.y - 120) });
  apply(commands);
  promptEl.value = ''; promptEl.dispatchEvent(new Event('input'));
}
$('composer').addEventListener('submit', async e => {
  e.preventDefault();
  const brief = promptEl.value.trim() || 'Sort this board into clear groups.';
  const [provider, modelId] = $('model').value.split('|');
  if (provider !== 'fake' && !(await host.get('/auth'))[provider]?.connected) {
    toast(`Sign in to ${provider === 'openai' ? 'ChatGPT' : 'Claude'} first`); renderAccounts(); $('settings').showModal(); return;
  }
  const count = Math.min(8, Math.max(1, Number($('count').value) || 1));
  const sel = canvas.selection();
  const full = sel.length ? `${brief}\n\n(Work on the selected cards: ${sel.join(', ')}.)` : brief;
  $('send').disabled = true;
  try {
    await host.post('/agents', { boardId: canvas.board.id, brief: full, model: { provider, modelId }, count });
    promptEl.value = ''; promptEl.dispatchEvent(new Event('input'));
    showAgents(true); refreshAgents();
  } catch (err) { toast(err.message); }
  finally { $('send').disabled = false; }
});
async function loadModels() {
  const list = await host.get('/models'); const auth = await host.get('/auth');
  const sel = $('model'); const saved = localStorage.getItem('aegis:model'); sel.innerHTML = '';
  for (const m of list) {
    const o = document.createElement('option'); o.value = `${m.provider}|${m.modelId}`;
    const ready = m.provider === 'fake' || auth[m.provider]?.connected;
    o.textContent = m.name + (ready ? '' : ' · sign in'); sel.appendChild(o);
  }
  const firstReady = list.find(m => m.provider === 'fake' || auth[m.provider]?.connected);
  sel.value = saved && [...sel.options].some(o => o.value === saved) ? saved : firstReady ? `${firstReady.provider}|${firstReady.modelId}` : sel.options[0]?.value;
  sel.onchange = () => localStorage.setItem('aegis:model', sel.value);
}

// ---------- agents ----------
const agentState = new Map();
const COLOURS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#ac8e68'];
const colourOf = id => COLOURS[Number(String(id).replace(/\D/g, '')) % COLOURS.length || 0];
function showAgents(on) { $('agentsPanel').hidden = !on; $('agentsBtn').setAttribute('aria-pressed', String(on)); }
$('agentsBtn').onclick = () => showAgents($('agentsPanel').hidden);
$('closeAgents').onclick = () => showAgents(false);
async function refreshAgents() {
  for (const a of await host.get(`/agents?board=${canvas.board.id}`)) agentState.set(a.id, a);
  renderAgents();
}
function renderAgents() {
  const list = $('agentList'); const all = [...agentState.values()].filter(a => a.boardId === canvas.board.id).reverse();
  // Parts sit under their lead, like Zephium's rows under a request.
  const mine = all.filter(a => !a.parent).flatMap(a => [a, ...all.filter(p => p.parent === a.id).reverse()]);
  for (const orphan of all.filter(p => p.parent && !all.some(a => a.id === p.parent))) mine.push(orphan);
  const running = mine.filter(a => a.running).length;
  $('agentCount').hidden = !running; $('agentCount').textContent = running;
  $('status').textContent = running ? `${running} agent${running > 1 ? 's' : ''} working` : '';
  if (!mine.length) { list.innerHTML = '<div class="empty-agents">No agents on this board yet.<br>Type in the box below to start one.</div>'; return; }
  const open = new Set([...list.querySelectorAll('.agent-row input')].filter(i => i === document.activeElement).map(i => i.closest('.agent-row').dataset.id));
  if (open.size) return; // don't rebuild while someone is typing a follow-up
  list.innerHTML = '';
  for (const a of mine) {
    const row = document.createElement('div'); row.className = 'agent-row' + (a.running ? ' running' : '') + (a.error ? ' failed' : '') + (a.parent ? ' part' : ''); row.dataset.id = a.id;
    row.innerHTML = '<div class="top"><span class="dot"></span><span class="brief"></span></div><div class="meta"></div><div class="out"></div><form class="actions"><input placeholder="Follow up…"><button type="button" class="text-btn stop">Stop</button></form>';
    row.querySelector('.dot').style.background = a.running ? colourOf(a.id) : '';
    row.querySelector('.brief').textContent = a.parent ? `${a.title ?? 'Part'}${a.summary ? ' · ' + a.summary : ''}` : (a.brief?.split('\n')[0] ?? 'Agent');
    row.querySelector('.meta').textContent = `${a.model?.modelId ?? ''} · ${a.error ?? a.step}`;
    row.querySelector('.out').textContent = a.text || '';
    row.querySelector('.stop').hidden = !a.running;
    row.querySelector('.stop').onclick = () => host.post(`/agents/${a.id}/stop`);
    row.querySelector('form').onsubmit = ev => { ev.preventDefault(); const v = row.querySelector('input').value.trim(); if (v) host.post(`/agents/${a.id}/message`, { content: v }).then(() => { row.querySelector('input').value = ''; }); };
    list.appendChild(row);
  }
}

// ---------- live events ----------
function listen() {
  const es = host.events();
  es.onmessage = async m => {
    const ev = JSON.parse(m.data);
    if (ev.type === 'board' && ev.boardId === canvas.board?.id && ev.author?.kind === 'agent') {
      await reloadBoard(ev.focus && Date.now() - ev.focus.at < 5000 ? ev.focus : null);
      library.refresh();
      if (ev.touched?.length) canvas.ring(ev.touched, colourOf(ev.author.conversationId));
    }
    if (ev.type === 'agent') { agentState.set(ev.id, ev); renderAgents(); }
    if (ev.type === 'auth') { renderAccounts(); loadModels(); }
    if (ev.type === 'library') library.refresh();
  };
  es.onerror = () => { es.close(); setTimeout(listen, 1500); };
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
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(localStorage.getItem('aegis:theme') || 'system'));

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200); }
addEventListener('keydown', e => {
  if (e.target.closest?.('textarea, input, [contenteditable], select')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) { if (e.key === '/' || e.key === 'k') { e.preventDefault(); promptEl.focus(); } return; }
  if (e.key === 'a') showAgents($('agentsPanel').hidden);
  if (e.key === 'f') setFollow(!follow);
  if (e.key === '\\') panels.toggle();
  if (TOOL_KEYS[e.key]) pickTool(TOOL_KEYS[e.key]);
  if (e.key === '/') { e.preventDefault(); promptEl.focus(); }
});

// ---------- start ----------
applyTheme(localStorage.getItem('aegis:theme') || 'system');
setFollow(follow);
const benchCount = Number(new URLSearchParams(location.search).get('bench'));
if (benchCount) { (await import('./canvas/bench.js')).bench(canvas, benchCount); return; }
let boards = await host.get('/boards');
if (!boards.length) boards = [await host.post('/boards', { name: 'First board' })];
const saved = localStorage.getItem('aegis:board');
await library.refresh();
await openBoard(boards.some(b => b.id === saved) ? saved : boards[0].id);
await loadModels();
listen();
window.aegis = { canvas, host, apply };
// Loaded from the host (an installed UI), say plainly if the native bridge is missing.
if (location.protocol === 'http:' && !location.port.startsWith('517')) host.bridge().then(r => { document.documentElement.dataset.bridge = r; if (r !== 'ok') toast(`Native bridge: ${r}`); });
}
