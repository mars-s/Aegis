import './style.css';
import { createIslandMorph } from './morph.js';
import { mountIslandMenu } from './menu.js';

const STAR = '<span class="orb-mark" aria-hidden="true"><span class="orb-colours"></span><span class="orb-light"></span></span>';
const shortTitle = a => (a.title || a.brief?.split('\n')[0] || 'Board assistant').replace(/^FAKE(?:TOOLS)?[\s\S]*/, 'Board assistant').slice(0, 42);

function renderTurns(el, agent) {
  const turns = [...(agent?.turns ?? [])];
  if (!turns.length && agent?.brief) turns.push({ id: 'request', role: 'user', text: agent.brief });
  if (!agent?.turns && agent?.text) turns.push({ id: 'answer', role: 'assistant', text: agent.text });
  if (agent?.partial) turns.push({ id: 'streaming', role: 'assistant', text: agent.partial });
  const signature = JSON.stringify(turns);
  if (el.dataset.turns === signature) return;
  const follow = el.scrollHeight - el.scrollTop - el.clientHeight < 36;
  el.dataset.turns = signature;
  const nodes = turns.map(turn => {
    const row = document.createElement('div'); row.className = `island-turn ${turn.role}`;
    const label = document.createElement('span'); label.className = 'turn-author'; label.textContent = turn.role === 'user' ? 'You' : 'Agent';
    const text = document.createElement('p'); text.textContent = turn.text; row.append(label, text); return row;
  });
  el.replaceChildren(...nodes);
  if (follow) el.scrollTop = el.scrollHeight;
}

export function mountAgents({ canvas, host, toast, showAll }) {
  const $ = id => document.getElementById(id);
  const island = $('agentIsland'), orb = $('askPill'), composer = $('composer'), prompt = $('prompt'), stage = $('stage');
  const head = composer.querySelector('.island-head'), history = composer.querySelector('.island-turns');
  const overlay = document.createElement('div'); overlay.className = 'agent-windows'; stage.append(overlay);
  const windows = new Map(); let all = [], selectedId = null, newAgent = false, leaveTimer = 0, doneTimer = 0, restoringFocus = false, hoverSuppressed = false;
  const current = () => newAgent ? null : all.find(a => a.id === selectedId) ?? all.find(a => !a.parent);
  const morph = createIslandMorph(island);
  const menu = mountIslandMenu({ island, current, shortTitle, agents: () => all,
    newAgent: () => { newAgent = true; closeMenu(); renderOrb(); open(true); }, show: id => show(id), showAll });
  const closeMenu = () => menu.close();
  const expanded = () => ['typing', 'conversation'].includes(island.dataset.state);
  function sizeInput() {
    prompt.style.height = '0px';
    prompt.style.height = `${Math.min(Math.floor(innerHeight * .4), Math.max(26, prompt.scrollHeight))}px`;
  }
  function state(next, instant = false) {
    clearTimeout(leaveTimer); clearTimeout(doneTimer);
    const old = island.dataset.state;
    morph(() => {
      island.dataset.state = next;
      const open = expanded();
      composer.classList.toggle('instant', instant); composer.classList.toggle('open', open); composer.inert = !open;
      orb.hidden = open; orb.setAttribute('aria-expanded', String(open));
      if (open) sizeInput(); else closeMenu();
    }, { instant, crossfade: old !== next });
    if (next === 'done') doneTimer = setTimeout(() => { if (island.dataset.state === 'done') state('idle'); }, 3600);
  }
  function open(instant = false, focus = true) {
    // The phone's Agents sheet temporarily borrows the composer. Keep its menu with it.
    const inSheet = !island.contains(composer);
    island.hidden = inSheet;
    if (inSheet) composer.append($('orbMenu'));
    renderOrb(); state(current() ? 'conversation' : 'typing', instant);
    history.scrollTop = history.scrollHeight;
    if (focus) prompt.focus({ preventScroll: true });
  }
  function close(instant = false) {
    if (island.contains(composer)) { island.hidden = false; island.append($('orbMenu')); }
    const hadFocus = island.contains(document.activeElement);
    state(current()?.running ? 'running' : 'idle', instant);
    hoverSuppressed = island.matches(':hover');
    if (hadFocus) { restoringFocus = true; orb.focus({ preventScroll: true }); restoringFocus = false; }
  }
  orb.onclick = e => open(e.detail === 0);
  island.addEventListener('pointerenter', e => {
    clearTimeout(leaveTimer);
    if (!hoverSuppressed && e.pointerType !== 'touch' && matchMedia('(hover: hover) and (pointer: fine)').matches && island.dataset.state === 'idle') state('hover');
  });
  island.addEventListener('pointerleave', () => {
    hoverSuppressed = false;
    leaveTimer = setTimeout(() => { if (island.dataset.state === 'hover') state('idle'); }, 160);
  });
  orb.addEventListener('focus', () => { if (!restoringFocus) open(true); });
  stage.addEventListener('pointerdown', () => { if (expanded()) close(); }, true);
  composer.addEventListener('open-composer', () => open(true));
  composer.addEventListener('close-composer', () => { if (!prompt.value.trim()) close(true); });
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) {
      e.preventDefault(); e.stopImmediatePropagation(); open(true);
    } else if (menu.contains(e.target)) {
      // Menu keys must reach the menu before the canvas's capture-phase shortcuts.
      menu.keydown(e); e.stopImmediatePropagation();
    }
  }, true);
  prompt.addEventListener('input', () => morph(sizeInput));
  addEventListener('resize', () => morph(sizeInput, { instant: true }));
  composer.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
  });
  composer.querySelector('.island-collapse').onclick = e => close(e.detail === 0);
  composer.querySelector('.island-stop').onclick = () => { const a = current(); if (a) stop(a.id); };
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
    w.el.innerHTML = `<header class="agent-window-strip">${STAR}<span class="agent-window-title"></span><button type="button" class="text-btn agent-close" aria-label="Close agent window">×</button></header><div class="agent-window-body"><p class="agent-window-status" role="status"></p><div class="agent-window-answer" role="log" aria-label="Agent conversation" tabindex="0"></div><form class="agent-follow"><input aria-label="Follow up with agent" placeholder="Follow up…"><button class="text-btn" type="submit">Send</button><button type="button" class="text-btn agent-stop">Stop</button></form></div>`;
    w.el.addEventListener('pointerdown', e => { e.stopPropagation(); selectedId = a.id; newAgent = false; renderOrb(); });
    w.el.addEventListener('focusin', () => {
      if (selectedId === a.id && !newAgent) return;
      selectedId = a.id; newAgent = false; renderOrb(true);
    });
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
  function renderOrb(instant = false) {
    morph(() => {
      const a = current(), running = !!a?.running;
      orb.classList.toggle('working', running);
      $('orbStatus').textContent = running ? a.status || 'Considering your request and the board' : a?.error || (a?.text ? a.text.replace(/\s+/g, ' ').slice(0, 130) : 'Ready for your next request');
      head.hidden = !a; history.hidden = !a;
      head.querySelector('.orb-activity').textContent = a?.error || a?.status || '';
      head.querySelector('.island-stop').hidden = !running;
      island.classList.toggle('failed', !!a?.error);
      renderTurns(history, a);
      prompt.placeholder = a ? 'Follow up with this agent…' : 'Ask about your board…';
      $('send').setAttribute('aria-label', a ? 'Send follow-up' : 'Start agent');
      if (expanded()) { island.dataset.state = a ? 'conversation' : 'typing'; sizeInput(); }
    }, { instant });
  }
  function update(agents) {
    const previous = current();
    all = agents;
    for (const w of windows.values()) w.el.hidden = w.closed || !all.some(a => a.id === w.agent.id);
    for (const a of all) {
      const w = windows.get(a.id) ?? makeWindow(a); w.agent = a; w.el.hidden = w.closed;
      w.el.classList.toggle('running', a.running); w.el.classList.toggle('failed', !!a.error);
      w.el.querySelector('.agent-window-title').textContent = `Agent · ${shortTitle(a)}`;
      w.el.querySelector('.agent-window-status').textContent = a.error || a.status || 'Considering your request and the board';
      renderTurns(w.el.querySelector('.agent-window-answer'), a);
      w.el.querySelector('.agent-stop').hidden = !a.running;
    }
    renderOrb(); paint();
    const a = current();
    if (!expanded()) {
      if (a?.running && island.dataset.state !== 'running') state('running');
      else if (previous?.running && a && !a.running) state('done');
    }
  }
  function near(id, ids) {
    const w = windows.get(id); if (!w || w.moved) return;
    const c = canvas.board.cards.find(c => ids.includes(c.id)); if (!c) return;
    const left = canvas.worldToScreen(c.x - 364, c.y);
    w.x = left.x >= 16 ? c.x - 364 : c.x + c.w + 24; w.y = c.y; w.moved = true; save(w); paint();
  }
  return { open, close, update, current, show, stop, near,
    wantsNew: () => newAgent,
    starting() { newAgent = false; },
    sent(id) { selectedId = id; },
    origin(id) { const w = windows.get(id); return w && !w.closed ? { x: w.x + 170, y: w.y + 36 } : undefined; },
  };
}
