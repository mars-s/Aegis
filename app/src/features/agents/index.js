import './style.css';
import './orb.css';
import { createIslandMorph } from './morph.js';
import { frameAboveIsland, requestResult } from './framing.js';
import { mountIslandMenu } from './menu.js';
import { renderHistory } from './history.js';
import { mountAgentIdentity } from './identity.js';
import { mountAgentEdges } from './edges.js';
import { mountAgentDrafts } from './drafts.js';
import { renderChatText } from './chat-text.js';
import { cardRect, freeAgentRect, intersects, WINDOW_WIDTH, COLLAPSED_HEIGHT } from './placement.js';
import { displayRotation } from '../settings/preferences.js';
// Round 3 navigation: first-use timing belongs to onboarding.
import { createOrbHint } from '../onboarding/orb-hint.js';

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
  const scrollTop = el.scrollTop;
  el.dataset.turns = signature;
  const nodes = turns.map(turn => {
    const row = document.createElement('div'); row.className = `island-turn ${turn.role}`;
    const label = document.createElement('span'); label.className = 'turn-author'; label.textContent = turn.role === 'user' ? 'You' : 'Agent';
    const text = document.createElement('div'); text.className = 'turn-text';
    if (turn.role === 'user') text.textContent = turn.text; else renderChatText(text, turn.text);
    if (turn.id === 'streaming') row.classList.add('streaming');
    row.append(label, text); return row;
  });
  el.replaceChildren(...nodes);
  el.scrollTop = follow ? el.scrollHeight : scrollTop;
}

export function mountAgents({ canvas, host, toast, showAll, beforeUndo, afterUndo }) {
  const $ = id => document.getElementById(id);
  const island = $('agentIsland'), orb = $('askPill'), composer = $('composer'), prompt = $('prompt'), stage = $('stage');
  const head = composer.querySelector('.island-head'), history = composer.querySelector('.island-turns');
  const overlay = document.createElement('div'); overlay.className = 'agent-windows'; stage.append(overlay);
  const edges = document.createElement('div'); edges.className = 'agent-edges'; document.body.append(edges);
  const windows = new Map(); let all = [], selectedId = null, newAgent = false, leaveTimer = 0, doneTimer = 0, restoringFocus = false, hoverSuppressed = false;
  const orbVisibility = new IntersectionObserver(entries => {
    for (const entry of entries) entry.target.classList.toggle('orb-offscreen', !entry.isIntersecting);
  });
  for (const mark of island.querySelectorAll('.orb-mark')) orbVisibility.observe(mark);
  function resolveMarks(root) {
    if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('motion-off')) return;
    for (const mark of root.querySelectorAll('.orb-mark')) {
      mark.classList.add('resolved');
      mark.addEventListener('animationend', () => mark.classList.remove('resolved'), { once: true });
    }
  }
  // Round 3 navigation: keep this hookup separate from history and placement.
  const { discover, dismiss: dismissHint } = createOrbHint({ island, host });
  // Round 3 agents: camera framing reads cached geometry only when asked to Fit.
  canvas.setAgentBounds(() => [...windows.values()].filter(w => !w.el.hidden && w.agent.boardId === canvas.board?.id).map(w => ({ x: w.x, y: w.y, w: WINDOW_WIDTH / canvas.view.z, h: (w.collapsed ? COLLAPSED_HEIGHT : w.screenHeight || COLLAPSED_HEIGHT) / canvas.view.z })));
  const current = () => newAgent ? null : all.find(a => a.id === selectedId) ?? all.find(a => !a.parent);
  const nameOf = a => a.title || `Agent ${all.filter(n => n.boardId === a.boardId).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id)).findIndex(n => n.id === a.id) + 1}`;
  const morph = createIslandMorph(island);
  const resultUndo = document.createElement('button'); resultUndo.type = 'button'; resultUndo.className = 'island-result-undo'; resultUndo.textContent = 'Undo'; resultUndo.hidden = true; island.querySelector('.island-content').append(resultUndo);
  resultUndo.onclick = async () => {
    const a = current(), result = requestResult(a); if (!result?.entry.canUndo) return;
    resultUndo.disabled = true; await undo(a.id, result.entry.id);
  };
  let framedIds = [];
  new ResizeObserver(() => { if (expanded() && framedIds.length) frameAboveIsland(canvas, island, framedIds); }).observe(island.querySelector('.island-morph'));
  function syncResult() {
    const result = requestResult(current()), visible = island.dataset.state === 'done' && !!result;
    island.classList.toggle('has-result', visible); resultUndo.hidden = !visible;
    resultUndo.disabled = !result?.entry.canUndo;
    resultUndo.title = result?.entry.undoBlockedReason || 'Undo this request';
    orb.setAttribute('aria-label', visible ? `${result.label}. Show changed windows.` : 'Ask the agent. Shortcut Cmd+K.');
  }
  // Windows pinned from the selection bar travel with the next request, whatever is selected by then.
  const contextEl = $('islandContext'); let pinned = [];
  const titleOf = c => (c.heading || c.text || c.data?.title || c.kind || c.type || 'window').split('\n')[0].trim().slice(0, 40);
  function pin(ids) {
    pinned = ids.filter(id => canvas.board?.cards.some(c => c.id === id));
    const cards = pinned.map(id => canvas.board.cards.find(c => c.id === id));
    contextEl.hidden = !pinned.length;
    contextEl.querySelector('.context-label').textContent = pinned.length === 1 ? titleOf(cards[0]) : `${pinned.length} windows · ${cards.slice(0, 2).map(titleOf).join(', ')}${pinned.length > 2 ? '…' : ''}`;
    contextEl.title = cards.map(titleOf).join('\n');
    island.classList.toggle('has-context', !!pinned.length);
    markContext();
  }
  // Pinned windows keep a quiet blue outline on the canvas until the request is sent or cleared.
  function markContext() {
    for (const el of stage.querySelectorAll('.card.in-context')) if (!pinned.includes(el.dataset.id)) el.classList.remove('in-context');
    for (const id of pinned) canvas.mountedEl(id)?.classList.add('in-context');
  }
  stage.addEventListener('canvaspaint', () => { if (pinned.length) markContext(); });
  contextEl.querySelector('.context-clear').onclick = () => { pin([]); morph(sizeInput); prompt.focus({ preventScroll: true }); };
  // Hovering the chip points at its windows on the canvas.
  contextEl.addEventListener('pointerenter', () => canvas.glow(pinned));
  document.addEventListener('ask-about-selection', e => {
    const ids = e.detail?.ids ?? canvas.selection(); if (!ids.length) return;
    pin(ids); canvas.glow(ids);
    open(!!e.detail?.keyboard);
    prompt.placeholder = ids.length === 1 ? 'What should the agent do with this window?' : `What should the agent do with these ${ids.length} windows?`;
  });
  stage.addEventListener('boardchange', e => { if (pinned.length && e.detail.board.id !== canvas.board?.id) pin([]); else if (pinned.length && pinned.some(id => !e.detail.board.cards.some(c => c.id === id))) pin(pinned); });
  // Streaming previews sit to the right of the agent's window, or at the view centre when it is closed.
  const drafts = mountAgentDrafts({ canvas, layer: overlay, anchor: id => {
    const w = windows.get(id);
    if (w && !w.closed && w.agent.boardId === canvas.board?.id) return { x: w.x + WINDOW_WIDTH + 24, y: w.y };
    const at = canvas.centre(); return { x: at.x - 160, y: at.y - 160 };
  } });
  const paintEdges = mountAgentEdges({ edges, recover, label: a => `${nameOf(a)}: ${shortTitle(a)}` });
  function recover(w, event) {
    const z = canvas.view.z, view = { x: stage.clientWidth / 2 - w.x * z - w.el.offsetWidth / 2, y: stage.clientHeight / 2 - w.y * z - (w.collapsed ? COLLAPSED_HEIGHT : w.el.offsetHeight) / 2, z };
    if (event.detail === 0) {
      canvas.setView(view);
      w.el.querySelector('.agent-window-toggle').focus({ preventScroll: true });
    } else canvas.glideTo(view);
  }
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
      syncResult();
    }, { instant, crossfade: old !== next });
    if (next === 'done') doneTimer = setTimeout(() => { if (island.dataset.state === 'done') state('idle'); }, 8000);
  }
  function open(instant = false, focus = true, frame = true) {
    dismissHint();
    // The phone's Agents sheet temporarily borrows the composer. Keep its menu with it.
    const inSheet = !island.contains(composer);
    island.hidden = inSheet;
    if (inSheet) composer.append($('orbMenu'));
    renderOrb(); state(current() ? 'conversation' : 'typing', instant);
    framedIds = frame ? pinned.length ? [...pinned] : canvas.selection().length ? canvas.selection() : requestResult(current())?.ids ?? [] : [];
    if (framedIds.length) frameAboveIsland(canvas, island, framedIds, instant);
    if (focus) prompt.focus({ preventScroll: true });
  }
  function close(instant = false) {
    if (island.contains(composer)) { island.hidden = false; island.append($('orbMenu')); }
    const hadFocus = island.contains(document.activeElement);
    state(current()?.running ? 'running' : 'idle', instant);
    hoverSuppressed = island.matches(':hover');
    if (hadFocus) { restoringFocus = true; orb.focus({ preventScroll: true }); restoringFocus = false; }
  }
  orb.onclick = e => {
    const result = requestResult(current());
    if (island.dataset.state === 'done' && result) { frameAboveIsland(canvas, island, result.ids, e.detail === 0); canvas.glow(result.ids); }
    else open(e.detail === 0);
  };
  island.addEventListener('pointerenter', e => {
    dismissHint();
    clearTimeout(leaveTimer);
    if (!hoverSuppressed && e.pointerType !== 'touch' && matchMedia('(hover: hover) and (pointer: fine)').matches && island.dataset.state === 'idle') state('hover');
  });
  island.addEventListener('pointerleave', () => {
    hoverSuppressed = false;
    leaveTimer = setTimeout(() => { if (island.dataset.state === 'hover') state('idle'); }, 160);
  });
  orb.addEventListener('focus', () => { if (!restoringFocus && island.dataset.state !== 'done') open(true, true, false); });
  stage.addEventListener('pointerdown', () => { if (expanded()) close(); }, true);
  composer.addEventListener('open-composer', () => open(true));
  document.addEventListener('capture-to-agent', e => {
    open(true);
    prompt.value = [prompt.value.trim(), e.detail.text].filter(Boolean).join('\n\n');
    sizeInput();
    composer.requestSubmit();
  });
  composer.addEventListener('close-composer', () => { if (!prompt.value.trim()) close(true); });
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) {
      e.preventDefault(); e.stopImmediatePropagation();
      // With windows selected, Cmd+K asks about them, just as the selection bar's star does.
      const selected = canvas.selection();
      if (selected.length && !expanded()) document.dispatchEvent(new CustomEvent('ask-about-selection', { detail: { ids: selected, keyboard: true } }));
      else open(true);
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
  function save(w) { localStorage.setItem(`aegis:agent-window:${w.agent.id}`, JSON.stringify({ x: w.x, y: w.y, closed: w.closed, collapsed: w.collapsed })); }
  let previousCards = [], cardSpace = [], movingSpace = [], spaceTimer = 0;
  mountAgentIdentity({ canvas, stage, overlay, edges, windows, occupied: () => [...cardSpace, ...movingSpace], label: a => `${nameOf(a)} · ${shortTitle(a)}` });
  function place(w, preferred = { x: w.x, y: w.y }, anchorOverride) {
    if (!canvas.board || w.closed || w.agent.boardId !== canvas.board.id) return;
    const cards = canvas.board.cards;
    const affected = cards.filter(c => w.touched?.has(c.id));
    const c = affected[0], at = canvas.centre();
    const anchor = anchorOverride ?? (c ? { x: c.x - WINDOW_WIDTH - 24, y: c.y } : { x: at.x - WINDOW_WIDTH / 2, y: at.y - 180 });
    const z = canvas.view.z, width = WINDOW_WIDTH / z;
    const height = (w.collapsed ? COLLAPSED_HEIGHT : w.screenHeight || COLLAPSED_HEIGHT) / z;
    const neighbours = [...windows.values()].filter(n => n !== w && !n.closed && n.agent.boardId === w.agent.boardId).map(n => ({ x: n.x, y: n.y, w: WINDOW_WIDTH / z, h: (n.collapsed ? COLLAPSED_HEIGHT : n.screenHeight || COLLAPSED_HEIGHT) / z }));
    const occupied = [...cardSpace, ...movingSpace, ...neighbours];
    // Once placed, a free window stays spatial even if a later camera move leaves it outside.
    const keep = w.placed && preferred && !occupied.some(c => intersects({ ...preferred, w: width, h: height }, c));
    const p = keep ? preferred : freeAgentRect([...cardSpace, ...movingSpace], neighbours, anchor, height, preferred, canvas.viewportRect(), width);
    if (p.x !== w.x || p.y !== w.y) canvas.clearAgentLine();
    w.x = p.x; w.y = p.y; w.height = height; w.placed = true; save(w);
  }
  stage.addEventListener('boardchange', e => {
    clearTimeout(spaceTimer);
    cardSpace = e.detail.board.cards.map(c => cardRect(c, displayRotation(c)));
    if (e.detail.first) movingSpace = [];
    else {
      // Reserve the whole path of a moving card while its compositor animation runs.
      const next = new Map(cardSpace.map(c => [c.id, c]));
      for (const c of previousCards) {
        const n = next.get(c.id);
        if (!n || c.x !== n.x || c.y !== n.y || c.w !== n.w || c.h !== n.h) {
          const x = Math.min(c.x, n?.x ?? c.x), y = Math.min(c.y, n?.y ?? c.y);
          movingSpace.push({ x, y, w: Math.max(c.x + c.w, n ? n.x + n.w : c.x + c.w) - x, h: Math.max(c.y + c.h, n ? n.y + n.h : c.y + c.h) - y });
        }
      }
      spaceTimer = setTimeout(() => { movingSpace = []; }, 1000);
    }
    previousCards = cardSpace;
    for (const w of windows.values()) place(w); paint();
  });
  function paint() {
    drafts.paint();
    if (!windows.size) return;
    const { width, height } = canvas.viewportSize, offscreen = [];
    for (const w of windows.values()) {
      const p = canvas.worldToScreen(w.x, w.y);
      w.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      // Round 3 agents: only open spatial windows get a constant-size edge target.
      const h = w.collapsed ? COLLAPSED_HEIGHT : w.screenHeight || COLLAPSED_HEIGHT, screenWidth = WINDOW_WIDTH;
      w.edge.hidden = w.el.hidden || (p.x + screenWidth > 0 && p.x < width && p.y + h > 0 && p.y < height);
      if (!w.edge.hidden) {
        const dx = p.x + screenWidth / 2 - width / 2, dy = p.y + h / 2 - height / 2;
        offscreen.push({ window: w, dx, dy });
      }
    }
    paintEdges(offscreen, width, height);
  }

  stage.addEventListener('canvaspaint', paint);
  function makeWindow(a) {
    let saved; try { saved = JSON.parse(localStorage.getItem(`aegis:agent-window:${a.id}`)); } catch { /* use the view centre */ }
    const at = canvas.centre();
    const w = { agent: a, x: saved?.x ?? at.x - 170, y: saved?.y ?? at.y - 180, closed: saved?.closed ?? false, collapsed: saved?.collapsed ?? true, moved: !!saved, el: document.createElement('section') };
    w.el.className = 'agent-window'; w.el.dataset.agentId = a.id; w.el.setAttribute('aria-label', 'Agent window');
    w.edge = document.createElement('button'); w.edge.type = 'button'; w.edge.tabIndex = 0; w.edge.className = 'agent-edge'; w.edge.dataset.agentId = a.id; w.edge.hidden = true;
    w.edge.innerHTML = `${STAR}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>`;
    w.edge.onpointerdown = e => e.stopPropagation();
    w.edge.onclick = e => recover(w, e);
    w.el.innerHTML = `<header class="agent-window-strip"><button type="button" class="agent-window-toggle" aria-expanded="false">${STAR}<span class="agent-window-title"></span><span class="agent-window-status" role="status"></span></button><button type="button" class="text-btn agent-close" aria-label="Close agent window">×</button></header><div class="agent-window-body"><ol class="agent-history" aria-label="Request changes"></ol><div class="agent-window-answer" role="log" aria-label="Agent conversation" tabindex="0"></div><form class="agent-follow"><input aria-label="Follow up with agent" placeholder="Follow up…"><button class="text-btn" type="submit">Send</button><button type="button" class="text-btn agent-stop">Stop</button></form></div>`;
    const toggle = w.el.querySelector('.agent-window-toggle'), body = w.el.querySelector('.agent-window-body');
    body.id = `agent-body-${a.id}`; toggle.setAttribute('aria-controls', body.id);
    function collapse(value) {
      w.collapsed = value; body.hidden = value; toggle.setAttribute('aria-expanded', String(!value));
      w.el.classList.toggle('collapsed', value); place(w);
      if (!value) {
        const area = canvas.viewportRect(), z = canvas.view.z;
        w.x = Math.max(area.x, Math.min(w.x, area.x + area.w - WINDOW_WIDTH / z));
        w.y = Math.max(area.y, Math.min(w.y, area.y + area.h - w.el.offsetHeight / z));
      }
      paint(); save(w);
    }
    w.expand = () => collapse(false);
    toggle.onclick = () => { if (w.dragged) { w.dragged = false; return; } collapse(!w.collapsed); };
    w.el.addEventListener('pointerdown', e => { e.stopPropagation(); selectedId = a.id; newAgent = false; renderOrb(); });
    w.el.addEventListener('focusin', () => {
      if (selectedId === a.id && !newAgent) return;
      selectedId = a.id; newAgent = false; renderOrb(true);
    });
    for (const type of ['dblclick', 'wheel']) w.el.addEventListener(type, e => e.stopPropagation());
    w.el.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !w.collapsed) { e.preventDefault(); e.stopPropagation(); collapse(true); toggle.focus({ preventScroll: true }); }
      if (['Enter', ' ', 'Backspace', 'Delete'].includes(e.key)) e.stopPropagation();
    });
    w.el.querySelector('.agent-close').onclick = () => { w.closed = true; w.el.hidden = true; w.edge.hidden = true; save(w); };
    w.el.querySelector('.agent-stop').onclick = () => stop(a.id);
    const form = w.el.querySelector('form');
    form.onsubmit = async e => {
      e.preventDefault(); const input = form.querySelector('input'), content = input.value.trim(); if (!content) return;
      try { await host.post(`/agents/${a.id}/message`, { content }); input.value = ''; } catch (err) { toast(err.message); }
    };
    const strip = w.el.querySelector('header'); let drag = null;
    const startDrag = e => {
      if (e.target.closest('.agent-close') || e.button !== 0) return;
      w.dragged = false; drag = { x: e.clientX, y: e.clientY, ox: w.x, oy: w.y };
      (e.target.closest('.agent-window-toggle') ?? e.currentTarget).setPointerCapture(e.pointerId);
    };
    const moveDrag = e => {
      if (!drag || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      w.dragged = true; w.moved = true; canvas.clearAgentLine();
      w.x = drag.ox + (e.clientX - drag.x) / canvas.view.z; w.y = drag.oy + (e.clientY - drag.y) / canvas.view.z; paint();
    };
    const end = () => { if (drag) { drag = null; place(w, { x: w.x, y: w.y }, { x: w.x, y: w.y }); paint(); save(w); setTimeout(() => { w.dragged = false; }, 0); } };
    strip.addEventListener('pointerdown', startDrag); strip.addEventListener('pointermove', moveDrag); strip.addEventListener('pointerup', end); strip.addEventListener('pointercancel', end);
    overlay.append(w.el); edges.append(w.edge); windows.set(a.id, w); collapse(w.collapsed);
    orbVisibility.observe(w.el);
    // History disclosure changes geometry without an agent update or a camera paint.
    const size = new ResizeObserver(() => {
      w.screenHeight = w.el.offsetHeight;
      if (!w.el.hidden && w.height !== w.el.offsetHeight / canvas.view.z) { place(w); paint(); }
    }); size.observe(w.el);
    return w;
  }
  function show(id) {
    const a = all.find(a => a.id === id); if (!a) return;
    selectedId = id; newAgent = false; const w = windows.get(id) ?? makeWindow(a); w.closed = false; w.el.hidden = false; w.expand(); w.moved = true; save(w);
    const z = Math.max(.7, Math.min(1.2, canvas.view.z));
    canvas.setView({ x: stage.clientWidth / 2 - (w.x + 170) * z, y: stage.clientHeight / 2 - (w.y + 120) * z, z });
    w.el.hidden = false; paint(); renderOrb();
  }
  async function stop(id) { try { await host.post(`/agents/${id}/stop`); } catch (e) { toast(e.message); } }
  async function undo(id, requestId) {
    try {
      await beforeUndo?.();
      await host.post(`/agents/${id}/history/${requestId}/undo`, {});
      canvas.clearAgentLine(); await afterUndo?.();
    } catch (e) { toast(e.message); }
  }
  function renderList(list, agents) {
    const previous = new Map([...list.querySelectorAll('.agent-summary')].map(row => [row.dataset.id, row]));
    if (!agents.length) { list.textContent = 'Ask from the orb to start an agent.'; return; }
    if (!previous.size) list.replaceChildren();
    for (const a of agents) {
      const existing = previous.get(a.id);
      if (existing) {
        existing.querySelector('.agent-summary-head span').textContent = `${nameOf(a)} · ${shortTitle(a)}`;
        existing.querySelector('.agent-summary-head small').textContent = a.error || a.status;
        existing.querySelector('.agent-summary-stop').hidden = !a.running;
        renderHistory(existing.querySelector('.agent-history'), a, undo); list.append(existing); previous.delete(a.id); continue;
      }
      const row = document.createElement('section'); row.className = 'agent-summary'; row.dataset.id = a.id;
      const head = document.createElement('div'); head.className = 'agent-summary-head';
      const info = document.createElement('div'), title = document.createElement('span'), status = document.createElement('small');
      title.textContent = `${nameOf(a)} · ${shortTitle(a)}`; status.textContent = a.error || a.status; info.append(title, status);
      const showButton = document.createElement('button'); showButton.className = 'text-btn'; showButton.textContent = 'Show'; showButton.onclick = () => show(a.id);
      const stopButton = document.createElement('button'); stopButton.className = 'text-btn agent-summary-stop'; stopButton.textContent = 'Stop'; stopButton.hidden = !a.running; stopButton.onclick = () => stop(a.id);
      const timeline = document.createElement('ol'); timeline.className = 'agent-history'; timeline.setAttribute('aria-label', 'Request changes'); renderHistory(timeline, a, undo);
      head.append(info, showButton, stopButton); row.append(head, timeline); list.append(row);
    }
    for (const row of previous.values()) row.remove();
  }
  function renderOrb(instant = false) {
    morph(() => {
      const a = current(), running = !!a?.running;
      orb.classList.toggle('working', running);
      $('orbStatus').textContent = running ? a.status || 'Considering your request and the board' : a?.error || (a?.text ? a.text.replace(/\s+/g, ' ').slice(0, 130) : 'Ready for your next request');
      const result = !running && requestResult(a);
      if (result) $('orbStatus').textContent = result.label;
      head.hidden = false; history.hidden = !a;
      head.querySelector('.orb-activity').textContent = a?.error || a?.status || 'Aegis';
      island.classList.toggle('working', running);
      head.querySelector('.island-stop').hidden = !running;
      island.classList.toggle('failed', !!a?.error);
      renderTurns(history, a);
      if (!pinned.length) prompt.placeholder = a ? 'Follow up with this agent…' : 'Ask about your board…';
      $('send').setAttribute('aria-label', a ? 'Send follow-up' : 'Start agent');
      if (expanded()) { island.dataset.state = a ? 'conversation' : 'typing'; sizeInput(); }
      syncResult();
    }, { instant });
  }
  function update(agents) {
    discover(agents);
    if (agents.length) dismissHint();
    const previous = current();
    all = agents;
    for (const w of windows.values()) { w.el.hidden = w.closed || !all.some(a => a.id === w.agent.id); if (!all.some(a => a.id === w.agent.id)) drafts.clear(w.agent.id); }
    for (const a of all) {
      const w = windows.get(a.id) ?? makeWindow(a);
      if (w.agent.running && !a.running && !a.error) resolveMarks(w.el);
      w.agent = a; w.el.hidden = w.closed;
      w.el.classList.toggle('running', a.running); w.el.classList.toggle('failed', !!a.error);
      w.el.querySelector('.agent-window-title').textContent = `${nameOf(a)} · ${shortTitle(a)}`;
      w.edge.setAttribute('aria-label', `Pan to ${nameOf(a)}: ${shortTitle(a)}`); w.edge.title = `Pan to ${nameOf(a)}`;
      w.el.querySelector('.agent-window-toggle').setAttribute('aria-label', `${nameOf(a)}: ${shortTitle(a)}`);
      w.el.querySelector('.agent-window-status').textContent = a.error || a.status || 'Considering your request and the board';
      w.el.querySelector('.agent-window-status').title = a.error || a.status || '';
      renderTurns(w.el.querySelector('.agent-window-answer'), a);
      drafts.sync(a);
      renderHistory(w.el.querySelector('.agent-history'), a, undo);
      w.el.querySelector('.agent-stop').hidden = !a.running;
      if (w.height !== w.el.offsetHeight / canvas.view.z) place(w);
    }
    renderOrb(); paint();
    const a = current();
    if (!expanded()) {
      if (a?.running && island.dataset.state !== 'running') state('running');
      else if (previous?.running && a && !a.running) state('done');
    }
    if (previous?.running && a && !a.running && !a.error) resolveMarks(island);
  }
  function near(id, ids) {
    const w = windows.get(id); if (!w) return;
    w.touched = new Set(ids); place(w, w.moved ? { x: w.x, y: w.y } : null); paint();
  }
  return { open, close, update, current, show, stop, near, renderList, nameOf,
    // The selection a request works on: pinned windows win over whatever happens to be selected now.
    takeContext() { const ids = pinned.length ? pinned : canvas.selection(); if (pinned.length) pin([]); return ids; },
    wantsNew: () => newAgent,
    starting() { newAgent = false; },
    sent(id) { selectedId = id; },
    origin(id) { const w = windows.get(id); return w && !w.closed ? { x: w.x + 170, y: w.y + COLLAPSED_HEIGHT } : undefined; },
  };
}
