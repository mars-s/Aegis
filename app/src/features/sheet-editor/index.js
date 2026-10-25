import './sheet.css';
import { registerCommand, registerCardMenu } from '../registry';
import { checkObject } from '../../lib/board/objects.js';
import { openSide, centreCardInLeft } from '../docs/side.js';
import { openDocument } from '../docs/editor.js';

let active = null;
const isSheet = card => card?.type === 'object' && card.kind === 'sheet';
const letter = c => String.fromCharCode(65 + c);
const clamp = (n, max) => Math.max(0, Math.min(max, n));
const numeric = new Set(['number', 'money', 'percent', 'duration', 'rating']);

export function openSheet(card, ctx, { keyboard = false } = {}) {
  if (!isSheet(card)) return;
  if (active?.id === card.id && active.boardId === ctx.canvas.board.id) { active.focus(); return; }
  const side = openSide({ title: card.text || 'Untitled sheet', kind: 'Sheet', keyboard });
  side.el.classList.add('sheet-editor');
  const boardId = ctx.canvas.board.id;
  let data = structuredClone(card.data), snapshot = JSON.stringify(data), minimumRev = ctx.canvas.board.rev;
  let selected = { r: 1, c: 0 }, editing = null, closed = false, version = 0, saving = false;
  side.body.innerHTML = `<div class="sheet-bar"><output class="sheet-ref" aria-label="Cell reference">A2</output><input class="sheet-value" aria-label="Selected cell value" maxlength="200" autocomplete="off" spellcheck="false"></div><div class="sheet-scroll" tabindex="0" role="grid" aria-label="Sheet cells. Arrow keys move, Return edits."></div><footer class="sheet-footer"><button type="button" data-add-row>Add row</button><button type="button" data-add-column>Add column</button><button type="button" data-remove-row>Remove row</button><button type="button" data-remove-column>Remove column</button><span class="sheet-hint">Return to edit · Esc to cancel</span></footer>`;
  const grid = side.body.querySelector('.sheet-scroll');
  const reference = side.body.querySelector('.sheet-ref'), value = side.body.querySelector('.sheet-value');
  const cell = p => grid.querySelector(`[data-r="${p.r}"][data-c="${p.c}"]`);
  const raw = p => p.r ? data.rows[p.r - 1].cells[p.c] : data.columns[p.c].label;
  function reveal(td) {
    const rect = td.getBoundingClientRect(), area = grid.getBoundingClientRect();
    if (rect.left < area.left + 46) grid.scrollLeft -= area.left + 46 - rect.left;
    else if (rect.right > area.right) grid.scrollLeft += rect.right - area.right;
    if (rect.top < area.top + 32) grid.scrollTop -= area.top + 32 - rect.top;
    else if (rect.bottom > area.bottom) grid.scrollTop += rect.bottom - area.bottom;
  }
  function select(p, scroll = true) {
    const old = cell(selected); old?.classList.remove('sel'); old?.setAttribute('aria-selected', 'false');
    selected = { r: clamp(p.r, data.rows.length), c: clamp(p.c, data.columns.length - 1) };
    const td = cell(selected); td.classList.add('sel'); td.setAttribute('aria-selected', 'true');
    grid.setAttribute('aria-activedescendant', td.id);
    reference.textContent = `${letter(selected.c)}${selected.r + 1}`; value.value = raw(selected);
    value.maxLength = selected.r ? 200 : 24;
    side.body.querySelector('[data-remove-row]').disabled = data.rows.length === 1 || selected.r === 0;
    side.body.querySelector('[data-remove-column]').disabled = data.columns.length === 1;
    if (scroll) reveal(td);
  }
  function render() {
    const table = document.createElement('table'); table.className = 'sheet-grid';
    const head = table.createTHead().insertRow();
    head.append(document.createElement('th'));
    data.columns.forEach((_, c) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = letter(c); head.append(th); });
    const tbody = table.createTBody();
    [data.columns.map(c => c.label), ...data.rows.map(row => row.cells)].forEach((row, r) => {
      const tr = tbody.insertRow(); if (!r) tr.className = 'head';
      const th = document.createElement('th'); th.scope = 'row'; th.textContent = String(r + 1); tr.append(th);
      row.forEach((text, c) => {
        const td = tr.insertCell(); td.dataset.r = r; td.dataset.c = c;
        td.id = `sheet-${card.id}-${r}-${c}`; td.setAttribute('role', 'gridcell'); td.setAttribute('aria-selected', 'false');
        td.classList.toggle('num', r > 0 && (numeric.has(data.columns[c].kind) || (text.trim() !== '' && Number.isFinite(Number(text)))));
        td.textContent = text;
      });
    });
    grid.replaceChildren(table);
    grid.setAttribute('aria-rowcount', String(data.rows.length + 2)); grid.setAttribute('aria-colcount', String(data.columns.length + 1));
    side.body.querySelector('[data-add-row]').disabled = data.rows.length >= 200;
    side.body.querySelector('[data-add-column]').disabled = data.columns.length >= 10;
    select(selected, false);
  }
  async function persist(command, next) {
    try { data = checkObject('sheet', next); }
    catch (error) { ctx.toast(error.message); return false; }
    snapshot = JSON.stringify(data);
    const revision = ++version, expected = snapshot;
    saving = true; side.setSaved('Saving…');
    try {
      if (ctx.canvas.board.id === boardId) { ctx.apply([command]); minimumRev = Math.max(minimumRev, ctx.canvas.board.rev); }
      else await ctx.host.post(`/boards/${boardId}/batch`, { commands: [command] });
      for (let attempt = 0; attempt < 40; attempt++) {
        const stored = await ctx.host.get(`/boards/${boardId}`);
        if (revision !== version) return true;
        const latest = stored.cards.find(c => c.id === card.id);
        if (!latest) throw new Error('This sheet was deleted');
        if (command.op === 'object_set' ? latest.data.rows[command.path[1]]?.cells[command.path[3]] === command.value : JSON.stringify(latest.data) === expected) {
          minimumRev = Math.max(minimumRev, stored.rev); saving = false; side.setSaved('Saved'); return true;
        }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      throw new Error('The host has not confirmed the save');
    } catch (error) {
      if (revision === version) { saving = false; side.setSaved('Not saved'); ctx.toast(`Sheet save failed: ${error.message}`); }
      return false;
    }
  }
  function setCell(p, text) {
    if (text === raw(p)) return;
    const next = structuredClone(data);
    if (p.r) next.rows[p.r - 1].cells[p.c] = text; else next.columns[p.c].label = text;
    const command = p.r ? { op: 'object_set', id: card.id, path: ['rows', p.r - 1, 'cells', p.c], value: text } : { op: 'revise', id: card.id, data: next };
    persist(command, next);
  }
  function edit(seed) {
    if (editing) return;
    const p = { ...selected }, td = cell(p), input = document.createElement('input');
    input.setAttribute('aria-label', 'Cell value'); input.maxLength = p.r ? 200 : 24; input.value = seed ?? raw(p);
    input.autocomplete = 'off'; td.replaceChildren(input);
    let done = false;
    const finish = (save, move = {}, focus = true) => {
      if (done) return; done = true; editing = null;
      if (save) setCell(p, input.value);
      render(); select({ r: p.r + (move.r || 0), c: p.c + (move.c || 0) });
      if (focus && !closed) grid.focus({ preventScroll: true });
    };
    editing = { finish };
    input.oninput = () => { value.value = input.value; };
    input.onkeydown = e => {
      if (['Enter', 'Tab', 'Escape'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'Escape') finish(false);
        else finish(true, e.key === 'Enter' ? { r: e.shiftKey ? -1 : 1 } : { c: e.shiftKey ? -1 : 1 });
      }
    };
    input.onblur = () => finish(true, {}, false);
    input.focus({ preventScroll: true }); if (seed === undefined) input.select();
  }
  grid.onpointerdown = e => {
    const td = e.target.closest('td'); if (!td || e.target.tagName === 'INPUT') return;
    editing?.finish(true, {}, false); select({ r: +td.dataset.r, c: +td.dataset.c }, false); grid.focus({ preventScroll: true });
  };
  grid.ondblclick = e => { if (e.target.closest('td')) edit(); };
  grid.onkeydown = e => {
    if (editing || e.target !== grid || e.metaKey || e.ctrlKey || e.altKey) return;
    const movement = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (movement) { e.preventDefault(); e.stopPropagation(); select({ r: selected.r + movement[0], c: selected.c + movement[1] }); }
    else if (e.key === 'Tab') {
      // Leave at either edge so Tab can always reach the rest of the app.
      if ((e.shiftKey && !selected.c) || (!e.shiftKey && selected.c === data.columns.length - 1)) return;
      e.preventDefault(); e.stopPropagation(); select({ ...selected, c: selected.c + (e.shiftKey ? -1 : 1) });
    } else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); e.stopPropagation(); edit(); }
    else if (e.key.length === 1) { e.preventDefault(); e.stopPropagation(); edit(e.key); }
  };
  value.onchange = () => { setCell(selected, value.value); render(); };
  value.onkeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); value.value = raw(selected); grid.focus({ preventScroll: true }); }
    else if (e.key === 'Enter') { e.preventDefault(); value.blur(); grid.focus({ preventScroll: true }); }
  };
  function structure(change) {
    editing?.finish(true, {}, false);
    const next = structuredClone(data); change(next);
    persist({ op: 'revise', id: card.id, data: next }, next); render();
  }
  side.body.querySelector('[data-add-row]').onclick = () => structure(next => next.rows.push({ cells: next.columns.map(() => '') }));
  side.body.querySelector('[data-add-column]').onclick = () => structure(next => { next.columns.push({ label: `Column ${letter(next.columns.length)}`, kind: 'text' }); next.rows.forEach(row => row.cells.push('')); });
  side.body.querySelector('[data-remove-row]').onclick = () => structure(next => next.rows.splice(selected.r - 1, 1));
  side.body.querySelector('[data-remove-column]').onclick = () => structure(next => { next.columns.splice(selected.c, 1); next.rows.forEach(row => row.cells.splice(selected.c, 1)); });
  const watch = setInterval(() => {
    if (ctx.canvas.board.id !== boardId) return side.close();
    if (ctx.canvas.board.rev < minimumRev) return;
    const latest = ctx.canvas.board.cards.find(c => c.id === card.id);
    if (!isSheet(latest)) return side.close();
    if (editing || document.activeElement === value || saving) return;
    const json = JSON.stringify(latest.data);
    if (json !== snapshot) { data = structuredClone(latest.data); snapshot = json; render(); }
    side.el.querySelector('.side-editor-name').textContent = latest.text || 'Untitled sheet';
  }, 500);
  side.el.addEventListener('side-editor-close', () => {
    closed = true; editing?.finish(true, {}, false); clearInterval(watch);
    if (active?.id === card.id) active = null;
  }, { once: true });
  active = { id: card.id, boardId, focus: () => grid.focus({ preventScroll: true }), key: grid.onkeydown, close: side.close };
  render(); active.focus(); centreCardInLeft(card, ctx, keyboard);
}

// Run before the controller's board shortcuts. A grid is not a text field, but
// typing here edits its active cell rather than choosing a canvas tool.
window.addEventListener('keydown', event => {
  if (!active || !event.target.matches?.('.sheet-scroll') || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'Escape') { event.preventDefault(); active.close({ keyboard: true }); }
  else active.key(event);
  event.stopImmediatePropagation();
}, true);

const selectedSheet = ctx => ctx.selection().length === 1 && ctx.canvas.board.cards.find(card => card.id === ctx.selection()[0] && isSheet(card));
registerCommand({ id: 'sheet-open', title: 'Open selected sheet', keys: 'enter', when: ctx => !document.activeElement?.closest('.side-editor') && !!selectedSheet(ctx), run: ctx => openSheet(selectedSheet(ctx), ctx, { keyboard: true }) });
registerCardMenu({ id: 'sheet-open', title: 'Open sheet', section: 'Sheet', when: (ctx, ids) => ids.length === 1 && ctx.canvas.board.cards.some(card => card.id === ids[0] && isSheet(card)), run: (ctx, ids) => openSheet(ctx.canvas.board.cards.find(card => card.id === ids[0]), ctx) });

function openFromDoubleClick(event) {
  const el = event.target.closest('.card.object.kind-sheet');
  if (!el || event.target.closest('button, input, select, a, [contenteditable]')) return;
  const ctx = globalThis.aegisCtx, card = ctx?.canvas.board.cards.find(card => card.id === el.dataset.id);
  if (!isSheet(card)) return;
  event.preventDefault(); event.stopImmediatePropagation(); openSheet(card, ctx);
}

// Features load before Svelte mounts #stage. Stop observing as soon as it exists.
function installStageOpener() {
  const stage = document.getElementById('stage');
  if (!stage) return false;
  stage.addEventListener('dblclick', openFromDoubleClick, true); return true;
}
if (!installStageOpener()) {
  const mount = new MutationObserver(() => { if (installStageOpener()) mount.disconnect(); });
  mount.observe(document.body, { childList: true, subtree: true });
}

window.addEventListener('aegis:open-card', event => {
  const ctx = globalThis.aegisCtx, card = ctx?.canvas.board.cards.find(card => card.id === event.detail?.id);
  const keyboard = event.detail?.keyboard ?? !!document.activeElement?.matches('button:focus-visible');
  if (isSheet(card)) openSheet(card, ctx, { keyboard });
  else if (card?.type === 'doc') openDocument(card, ctx, { keyboard });
});
