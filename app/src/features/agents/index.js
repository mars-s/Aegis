import './style.css';

const STAR = '<span class="orb-mark" aria-hidden="true"><span class="orb-colours"></span><span class="orb-light"></span></span>';
const shortTitle = a => (a.title || a.brief?.split('\n')[0] || 'Board assistant').replace(/^FAKE(?:TOOLS)?[\s\S]*/, 'Board assistant').slice(0, 42);

export function mountAgents({ canvas, host, toast, showAll }) {
  const $ = id => document.getElementById(id);
  const orb = $('askPill'), composer = $('composer'), prompt = $('prompt'), stage = $('stage');
  orb.className = 'ask-orb'; orb.innerHTML = STAR + '<span class="orb-status" id="orbStatus"></span>';
  const recent = document.createElement('div'); recent.className = 'orb-recent'; recent.hidden = true;
  recent.innerHTML = '<p class="orb-activity"></p><p class="orb-answer"></p>'; composer.prepend(recent);
  const menuButton = document.createElement('button'); menuButton.type = 'button'; menuButton.id = 'orbMenuButton'; menuButton.className = 'text-btn'; menuButton.textContent = 'Options'; menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-controls', 'orbMenu');
  const menu = document.createElement('div'); menu.id = 'orbMenu'; menu.className = 'orb-menu'; menu.hidden = true;
  composer.append(menu); composer.querySelector('.composer-row').prepend(menuButton);
  const overlay = document.createElement('div'); overlay.className = 'agent-windows'; stage.append(overlay);
  const windows = new Map(); let all = [], selectedId = null, newAgent = false, leaveTimer = 0, restoringFocus = false, hoverSuppressed = false, pointer = null;
  const current = () => newAgent ? null : all.find(a => a.id === selectedId) ?? all.find(a => !a.parent && windows.has(a.id)) ?? all.find(a => !a.parent);
  function resize() {
    const longest = Math.max(...prompt.value.split('\n').map(s => s.length), 0);
    composer.style.width = `${Math.min(innerWidth - 24, 640, Math.max(360, 240 + longest * 6))}px`;
    prompt.style.height = '0px';
    prompt.style.height = `${Math.min(Math.floor(innerHeight * .4), Math.max(26, prompt.scrollHeight))}px`;
  }
  function open(instant = false, focus = true) {
    clearTimeout(leaveTimer); composer.classList.toggle('instant', instant); composer.hidden = false; composer.inert = false;
    composer.classList.add('open'); orb.hidden = true; orb.setAttribute('aria-expanded', 'true'); resize();
    if (focus) prompt.focus({ preventScroll: true });
  }
  function close(instant = false) {
    clearTimeout(leaveTimer); composer.classList.toggle('instant', instant); composer.classList.remove('open'); composer.inert = true;
    menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); orb.hidden = false; orb.setAttribute('aria-expanded', 'false');
    const r = orb.getBoundingClientRect();
    hoverSuppressed = !!pointer && pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
    if (composer.contains(document.activeElement)) {
      restoringFocus = true; orb.focus({ preventScroll: true }); restoringFocus = false;
    }
  }
  orb.onclick = e => open(e.detail === 0);
  document.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  orb.addEventListener('pointerenter', e => { pointer = { x: e.clientX, y: e.clientY }; if (!hoverSuppressed && e.pointerType !== 'touch') open(false, false); });
  orb.addEventListener('pointerleave', () => { hoverSuppressed = false; });
  orb.addEventListener('focus', () => { if (!restoringFocus) open(true); });
  composer.addEventListener('pointerenter', () => clearTimeout(leaveTimer));
  composer.addEventListener('pointerleave', () => {
    leaveTimer = setTimeout(() => { if (!prompt.value.trim() && menu.hidden && (current()?.running || !composer.contains(document.activeElement))) close(); }, 280);
  });
  composer.addEventListener('focusout', () => setTimeout(() => {
    if (!composer.contains(document.activeElement) && !composer.matches(':hover') && !prompt.value.trim()) close();
  }, 0));
  stage.addEventListener('pointerdown', () => { if (composer.classList.contains('open')) close(); }, true);
  composer.addEventListener('open-composer', () => open(true));
  composer.addEventListener('close-composer', () => { if (!prompt.value.trim()) close(true); });
  prompt.addEventListener('input', resize);
  addEventListener('resize', resize);
  composer.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } });
  // Hiding the page pauses only the two tiny colour layers, no drawing loop is needed.
  const visibility = () => document.body.classList.toggle('agents-hidden', document.hidden);
  document.addEventListener('visibilitychange', visibility); visibility();
  function save(w) { localStorage.setItem(`aegis:agent-window:${w.agent.id}`, JSON.stringify({ x: w.x, y: w.y, closed: w.closed })); }
  function paint() {
    for (const w of windows.values()) {
      const p = canvas.worldToScreen(w.x, w.y), z = canvas.view.z;
      w.el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${z})`;
    }
  }
  stage.addEventListener('canvaspaint', paint);
  function makeWindow(a) {
    let saved; try { saved = JSON.parse(localStorage.getItem(`aegis:agent-window:${a.id}`)); } catch { /* use the view centre */ }
    const at = canvas.centre(), offset = [...windows.values()].filter(w => w.agent.boardId === a.boardId).length * 36;
    const w = { agent: a, x: saved?.x ?? at.x - 170 + offset, y: saved?.y ?? at.y - 180 + offset, closed: saved?.closed ?? false, moved: !!saved, el: document.createElement('section') };
    w.el.className = 'agent-window'; w.el.dataset.agentId = a.id; w.el.setAttribute('aria-label', 'Agent window');
    w.el.innerHTML = `<header class="agent-window-strip">${STAR}<span class="agent-window-title"></span><button type="button" class="text-btn agent-close" aria-label="Close agent window">×</button></header><div class="agent-window-body"><p class="agent-window-status" role="status"></p><p class="agent-window-answer"></p><form class="agent-follow"><input aria-label="Follow up with agent" placeholder="Follow up…"><button class="text-btn" type="submit">Send</button><button type="button" class="text-btn agent-stop">Stop</button></form></div>`;
    w.el.addEventListener('pointerdown', e => { e.stopPropagation(); selectedId = a.id; newAgent = false; renderOrb(); });
    for (const type of ['dblclick', 'wheel']) w.el.addEventListener(type, e => e.stopPropagation());
    w.el.addEventListener('keydown', e => { if (['Enter', ' ', 'Backspace', 'Delete'].includes(e.key)) e.stopPropagation(); });
    w.el.querySelector('.agent-close').onclick = () => { w.closed = true; w.el.hidden = true; save(w); };
    w.el.querySelector('.agent-stop').onclick = () => stop(a.id);
    const form = w.el.querySelector('form');
    form.onsubmit = async e => {
      e.preventDefault(); const input = form.querySelector('input'), content = input.value.trim(); if (!content) return;
      try { await host.post(`/agents/${a.id}/message`, { content }); input.value = ''; } catch (err) { toast(err.message); }
    };
    const strip = w.el.querySelector('header'); let drag = null;
    strip.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || e.button !== 0) return;
      e.preventDefault(); drag = { x: e.clientX, y: e.clientY, ox: w.x, oy: w.y }; strip.setPointerCapture(e.pointerId); canvas.clearAgentLine();
    });
    strip.addEventListener('pointermove', e => {
      if (!drag) return; w.moved = true; w.x = drag.ox + (e.clientX - drag.x) / canvas.view.z; w.y = drag.oy + (e.clientY - drag.y) / canvas.view.z; paint();
    });
    const end = () => { if (drag) { drag = null; save(w); } };
    strip.addEventListener('pointerup', end); strip.addEventListener('pointercancel', end);
    overlay.append(w.el); windows.set(a.id, w); return w;
  }
  function show(id) {
    const a = all.find(a => a.id === id); if (!a) return;
    selectedId = id; newAgent = false; const w = windows.get(id) ?? makeWindow(a); w.closed = false; w.moved = true; save(w);
    const z = Math.max(.7, Math.min(1.2, canvas.view.z));
    canvas.setView({ x: stage.clientWidth / 2 - (w.x + 170) * z, y: stage.clientHeight / 2 - (w.y + 120) * z, z });
    w.el.hidden = false; paint(); renderOrb();
  }
  async function stop(id) { try { await host.post(`/agents/${id}/stop`); } catch (e) { toast(e.message); } }
  function renderMenu() {
    menu.replaceChildren();
    const add = (label, run) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => { run(); menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); }; menu.append(b); };
    add('New agent', () => { newAgent = true; renderOrb(); prompt.focus(); });
    add('All agents', showAll);
    const title = document.createElement('p'); title.textContent = 'Agents'; menu.append(title);
    for (const a of all) add(shortTitle(a), () => show(a.id));
  }
  menuButton.onclick = () => { renderMenu(); menu.hidden = !menu.hidden; menuButton.setAttribute('aria-expanded', String(!menu.hidden)); };
  function renderOrb() {
    const a = current(), running = !!a?.running;
    orb.classList.toggle('working', running); $('orbStatus').textContent = running ? a.status || 'Considering your request and the board' : '';
    recent.hidden = !a; recent.querySelector('.orb-activity').textContent = a?.status || '';
    recent.querySelector('.orb-answer').textContent = a?.text || '';
    prompt.placeholder = a ? 'Follow up with this agent…' : 'Ask about your board…';
    composer.classList.toggle('has-agent', !!a);
  }
  function update(agents) {
    all = agents;
    for (const w of windows.values()) w.el.hidden = w.closed || !all.some(a => a.id === w.agent.id);
    for (const a of all) {
      const w = windows.get(a.id) ?? makeWindow(a); w.agent = a; w.el.hidden = w.closed;
      w.el.classList.toggle('running', a.running); w.el.classList.toggle('failed', !!a.error);
      w.el.querySelector('.agent-window-title').textContent = `Agent · ${shortTitle(a)}`;
      w.el.querySelector('.agent-window-status').textContent = a.error || a.status || 'Considering your request and the board';
      w.el.querySelector('.agent-window-answer').textContent = a.text || '';
      w.el.querySelector('.agent-stop').hidden = !a.running;
    }
    renderOrb(); paint();
  }
  function near(id, ids) {
    const w = windows.get(id); if (!w || w.moved) return;
    const c = canvas.board.cards.find(c => ids.includes(c.id)); if (!c) return;
    const left = canvas.worldToScreen(c.x - 364, c.y);
    w.x = left.x >= 16 ? c.x - 364 : c.x + c.w + 24; w.y = c.y; w.moved = true; save(w); paint();
  }
  return { open, close, update, current, show, stop, near,
    wantsNew: () => newAgent,
    sent(id) { selectedId = id; newAgent = false; },
    origin(id) { const w = windows.get(id); return w && !w.closed ? { x: w.x + 170, y: w.y + 36 } : undefined; },
  };
}
