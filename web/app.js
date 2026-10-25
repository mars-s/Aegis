// Aegis app: boards, composer, agents and settings, talking to the local agent host.
import { createCanvas } from './canvas.js';
import { applyBatch } from './board/commands.js';

const $ = id => document.getElementById(id);
const host = await connect();
const canvas = createCanvas({
  stage: $('stage'), world: $('world'), grid: $('grid'), links: $('links'), marquee: $('marquee'),
  onBatch: { apply: (commands, done) => apply(commands, done), view: v => host.post(`/boards/${canvas.board.id}/view`, { view: v }).catch(() => {}) },
  onSelect: () => {},
  onOpenUrl: url => host.openUrl(url),
});

// ---------- host connection: Tauri gives us the port and token; a browser uses ?port=&token= ----------
async function connect() {
  let port, token;
  if (window.__TAURI_INTERNALS__) {
    for (let i = 0; i < 60 && !port; i++) {
      const info = await window.__TAURI_INTERNALS__.invoke('agent_info').catch(() => null);
      if (info?.port) ({ port, token } = info); else await new Promise(r => setTimeout(r, 250));
    }
  } else {
    const q = new URLSearchParams(location.search); port = q.get('port') || localStorage.getItem('aegis:port'); token = q.get('token') || localStorage.getItem('aegis:token');
    if (port) { localStorage.setItem('aegis:port', port); localStorage.setItem('aegis:token', token); }
  }
  if (!port) { document.body.innerHTML = '<p style="font:14px system-ui;padding:40px">The Aegis agent host is not running.</p>'; throw new Error('no host'); }
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j;
  };
  return {
    get: p => call('GET', p), post: (p, b) => call('POST', p, b ?? {}),
    events: () => new EventSource(`${base}/events?token=${encodeURIComponent(token)}`),
    openUrl: url => window.__TAURI_INTERNALS__ ? window.__TAURI_INTERNALS__.invoke('open_url', { url }) : open(url, '_blank'),
    copy: text => window.__TAURI_INTERNALS__ ? window.__TAURI_INTERNALS__.invoke('copy_text', { text }) : navigator.clipboard.writeText(text),
  };
}

// ---------- boards ----------
let pending = Promise.resolve();
async function openBoard(id) {
  const b = await host.get(`/boards/${id}`);
  canvas.setBoard(b); localStorage.setItem('aegis:board', id);
  $('boardName').textContent = b.name; refreshEmpty(); refreshAgents();
}
async function reloadBoard(focus) {
  const b = await host.get(`/boards/${canvas.board.id}`);
  if (b.rev <= canvas.board.rev && !focus) return;
  canvas.setBoard(b); refreshEmpty();
  if (focus?.ids?.length) { canvas.frameIds(focus.ids); setTimeout(() => canvas.glow(focus.ids), 450); }
}
function refreshEmpty() { $('empty').hidden = canvas.board.cards.length > 0; }
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
async function boardsMenu() {
  const menu = $('boardsMenu'); const list = await host.get('/boards');
  menu.innerHTML = '';
  for (const b of list) {
    const btn = document.createElement('button'); btn.innerHTML = '<span></span><span class="meta"></span>';
    btn.firstChild.textContent = b.name; btn.lastChild.textContent = b.cards;
    btn.onclick = () => { closeMenu(); openBoard(b.id); }; menu.appendChild(btn);
  }
  menu.insertAdjacentHTML('beforeend', '<div class="sep"></div>');
  const add = document.createElement('button'); add.textContent = 'New board'; add.onclick = async () => { closeMenu(); const b = await host.post('/boards', { name: 'Untitled' }); openBoard(b.id); };
  const rename = document.createElement('button'); rename.textContent = 'Rename…'; rename.onclick = async () => { closeMenu(); const name = prompt('Board name', canvas.board.name); if (name) { await host.post(`/boards/${canvas.board.id}/name`, { name }); $('boardName').textContent = name; canvas.board.name = name; } };
  menu.append(add, rename);
  menu.hidden = false; $('boardsBtn').setAttribute('aria-expanded', 'true');
}
function closeMenu() { $('boardsMenu').hidden = true; $('boardsBtn').setAttribute('aria-expanded', 'false'); }
$('boardsBtn').onclick = e => { e.stopPropagation(); $('boardsMenu').hidden ? boardsMenu() : closeMenu(); };
addEventListener('click', e => { if (!e.target.closest('#boardsMenu')) closeMenu(); });

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
  const list = $('agentList'); const mine = [...agentState.values()].filter(a => a.boardId === canvas.board.id).reverse();
  const running = mine.filter(a => a.running).length;
  $('agentCount').hidden = !running; $('agentCount').textContent = running;
  $('status').textContent = running ? `${running} agent${running > 1 ? 's' : ''} working` : '';
  if (!mine.length) { list.innerHTML = '<div class="empty-agents">No agents on this board yet.<br>Type in the box below to start one.</div>'; return; }
  const open = new Set([...list.querySelectorAll('.agent-row input')].filter(i => i === document.activeElement).map(i => i.closest('.agent-row').dataset.id));
  if (open.size) return; // don't rebuild while someone is typing a follow-up
  list.innerHTML = '';
  for (const a of mine) {
    const row = document.createElement('div'); row.className = 'agent-row' + (a.running ? ' running' : '') + (a.error ? ' failed' : ''); row.dataset.id = a.id;
    row.innerHTML = '<div class="top"><span class="dot"></span><span class="brief"></span></div><div class="meta"></div><div class="out"></div><form class="actions"><input placeholder="Follow up…"><button type="button" class="text-btn stop">Stop</button></form>';
    row.querySelector('.dot').style.background = a.running ? colourOf(a.id) : '';
    row.querySelector('.brief').textContent = a.brief?.split('\n')[0] ?? 'Agent';
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
      if (ev.touched?.length) canvas.ring(ev.touched, colourOf(ev.author.conversationId));
    }
    if (ev.type === 'agent') { agentState.set(ev.id, ev); renderAgents(); }
    if (ev.type === 'auth') { renderAccounts(); loadModels(); }
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
  if (e.key === 'a' && !e.metaKey && !e.ctrlKey) showAgents($('agentsPanel').hidden);
  if (e.key === '/' || (e.key === 'k' && e.metaKey)) { e.preventDefault(); promptEl.focus(); }
});

// ---------- start ----------
applyTheme(localStorage.getItem('aegis:theme') || 'system');
const benchCount = Number(new URLSearchParams(location.search).get('bench'));
if (benchCount) { (await import('./bench.js')).bench(canvas, benchCount); throw new Error('bench mode: boards untouched'); }
let boards = await host.get('/boards');
if (!boards.length) boards = [await host.post('/boards', { name: 'First board' })];
const saved = localStorage.getItem('aegis:board');
await openBoard(boards.some(b => b.id === saved) ? saved : boards[0].id);
await loadModels();
listen();
window.aegis = { canvas, host, apply };
