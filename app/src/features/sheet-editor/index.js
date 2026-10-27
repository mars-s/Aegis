import './sheet.css';
import '../../lib/ui/ribbon.css';
import { registerCommand, registerCardMenu } from '../registry';
import { checkObject } from '@aegis/domain/objects';
import { openSide, centreCardInLeft } from '../docs/side.js';
import { openDocument } from '../docs/editor.js';
import { createMenu } from '../../lib/ui/menu.js';

let active = null;
const isSheet = card => card?.type === 'object' && card.kind === 'sheet';
const letter = c => String.fromCharCode(65 + c);
const clamp = (n, max) => Math.max(0, Math.min(max, n));
const numeric = new Set(['number', 'money', 'percent', 'duration', 'rating']);
const NUMERIC_KINDS = new Set(['number', 'money', 'percent', 'duration']);
const KIND_LABEL = { text: 'Text', number: 'Number', money: 'Currency', percent: 'Percent', date: 'Date', duration: 'Duration', yes_no: 'Yes / No', rating: 'Rating', link: 'Link', tag: 'Tag' };

export function openSheet(card, ctx, { keyboard = false } = {}) {
  if (!isSheet(card)) return;
  if (active?.id === card.id && active.boardId === ctx.canvas.board.id) { active.focus(); return; }
  const side = openSide({ title: card.text || 'Untitled sheet', kind: 'Sheet', card, ctx, keyboard });
  side.el.classList.add('sheet-editor');
  const boardId = ctx.canvas.board.id;
  let data = structuredClone(card.data), snapshot = JSON.stringify(data), minimumRev = ctx.canvas.board.rev;
  let selected = { r: 1, c: 0 }, anchor = null, editing = null, closed = false, version = 0, saving = false;
  const icon = d => `<svg viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
  // A ribbon like an office sheet: column type, sort, structure. Each group is separated by a hairline.
  side.body.innerHTML = `<div class="office-ribbon" role="toolbar" aria-label="Sheet tools">
    <div class="ribbon-group"><span class="ribbon-label">Column</span><button type="button" class="ribbon-select" data-kind aria-haspopup="menu" title="Column type"><span data-kind-label>Text</span>${icon('<path d="m5 6 3 3 3-3"/>')}</button></div>
    <div class="ribbon-group"><button type="button" class="ribbon-btn" data-sort="1" title="Sort ascending" aria-label="Sort ascending">${icon('<path d="M4 3v10M2 11l2 2 2-2M9 4h5M9 8h4M9 12h3"/>')}</button><button type="button" class="ribbon-btn" data-sort="-1" title="Sort descending" aria-label="Sort descending">${icon('<path d="M4 3v10M2 5l2-2 2 2M9 4h3M9 8h4M9 12h5"/>')}</button></div>
    <div class="ribbon-group"><button type="button" class="ribbon-btn" data-add-row title="Add row below" aria-label="Add row">${icon('<rect x="2.5" y="2.5" width="11" height="5" rx="1"/><path d="M8 10v4M6 12h4"/>')}</button><button type="button" class="ribbon-btn" data-add-column title="Add column to the right" aria-label="Add column">${icon('<rect x="2.5" y="2.5" width="5" height="11" rx="1"/><path d="M10 8h4M12 6v4"/>')}</button><button type="button" class="ribbon-btn" data-remove-row title="Remove row" aria-label="Remove row">${icon('<rect x="2.5" y="2.5" width="11" height="5" rx="1"/><path d="M6 12h4"/>')}</button><button type="button" class="ribbon-btn" data-remove-column title="Remove column" aria-label="Remove column">${icon('<rect x="2.5" y="2.5" width="5" height="11" rx="1"/><path d="M10 8h4"/>')}</button></div>
    <div class="ribbon-group"><button type="button" class="ribbon-btn" data-clear title="Clear cells" aria-label="Clear selected cells">${icon('<path d="M3 13h10M5 10l5.5-6.5 2.5 2.5L7.5 12H5z"/>')}</button></div>
  </div><div class="sheet-bar"><output class="sheet-ref" aria-label="Cell reference">A2</output><span class="sheet-fx" aria-hidden="true">Value</span><input class="sheet-value" aria-label="Selected cell value" maxlength="200" autocomplete="off" spellcheck="false"></div><div class="sheet-scroll" tabindex="0" role="grid" aria-multiselectable="true" aria-label="Sheet cells. Arrow keys move, Shift extends, Return edits."></div><footer class="sheet-status" role="status" aria-live="polite"><span data-stats></span><span class="sheet-hint">Return to edit · Shift arrows to select</span></footer>`;
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
  // The range runs from the anchor to the active cell; without an anchor it is just the active cell.
  const range = () => { const a = anchor ?? selected; return { r0: Math.min(a.r, selected.r), r1: Math.max(a.r, selected.r), c0: Math.min(a.c, selected.c), c1: Math.max(a.c, selected.c) }; };
  function paintRange() {
    const { r0, r1, c0, c1 } = range(), multi = r0 !== r1 || c0 !== c1;
    for (const td of grid.querySelectorAll('td')) {
      const r = +td.dataset.r, c = +td.dataset.c, inside = r >= r0 && r <= r1 && c >= c0 && c <= c1;
      td.classList.toggle('in-range', multi && inside);
      td.classList.toggle('edge-t', multi && inside && r === r0); td.classList.toggle('edge-b', multi && inside && r === r1);
      td.classList.toggle('edge-l', multi && inside && c === c0); td.classList.toggle('edge-r', multi && inside && c === c1);
      td.setAttribute('aria-selected', String(inside));
    }
    // Row and column headers light up for the range, as in a desktop spreadsheet.
    grid.querySelectorAll('thead th[data-c]').forEach(th => th.classList.toggle('hl', +th.dataset.c >= c0 && +th.dataset.c <= c1));
    grid.querySelectorAll('tbody th[data-r]').forEach(th => th.classList.toggle('hl', +th.dataset.r >= r0 && +th.dataset.r <= r1));
    const kind = data.columns[selected.c]?.kind ?? 'text';
    const unit = data.columns[selected.c]?.unit;
    side.body.querySelector('[data-kind-label]').textContent = `${KIND_LABEL[kind] ?? kind}${unit ? ` · ${unit}` : ''}`;
    // Sum, average and count of numeric cells in the range.
    const values = [];
    for (let r = Math.max(1, r0); r <= r1; r++) for (let c = c0; c <= c1; c++) { const v = Number(String(data.rows[r - 1]?.cells[c] ?? '').replace(/[,$%\s]/g, '')); if (data.rows[r - 1]?.cells[c]?.trim() && Number.isFinite(v)) values.push(v); }
    const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
    const cells = (r1 - r0 + 1) * (c1 - c0 + 1);
    side.body.querySelector('[data-stats]').textContent = values.length > 1 ? `Sum ${fmt(values.reduce((a, b) => a + b, 0))}   Average ${fmt(values.reduce((a, b) => a + b, 0) / values.length)}   Count ${values.length}` : multi ? `${cells} cells` : '';
  }
  function select(p, scroll = true, extend = false) {
    const old = cell(selected); old?.classList.remove('sel');
    if (extend) anchor ??= { ...selected }; else anchor = null;
    selected = { r: clamp(p.r, data.rows.length), c: clamp(p.c, data.columns.length - 1) };
    const td = cell(selected); td.classList.add('sel');
    grid.setAttribute('aria-activedescendant', td.id);
    reference.textContent = `${letter(selected.c)}${selected.r + 1}`; value.value = raw(selected);
    value.maxLength = selected.r ? 200 : 24;
    side.body.querySelector('[data-remove-row]').disabled = data.rows.length === 1 || selected.r === 0;
    side.body.querySelector('[data-remove-column]').disabled = data.columns.length === 1;
    paintRange();
    if (scroll) reveal(td);
  }
  function render() {
    const table = document.createElement('table'); table.className = 'sheet-grid';
    const head = table.createTHead().insertRow();
    head.append(document.createElement('th'));
    data.columns.forEach((_, c) => { const th = document.createElement('th'); th.scope = 'col'; th.dataset.c = c; th.textContent = letter(c); head.append(th); });
    const tbody = table.createTBody();
    [data.columns.map(c => `${c.label}${c.unit ? ` (${c.unit})` : ''}`), ...data.rows.map(row => row.cells)].forEach((row, r) => {
      const tr = tbody.insertRow(); if (!r) tr.className = 'head';
      const th = document.createElement('th'); th.scope = 'row'; th.dataset.r = r; th.textContent = String(r + 1); tr.append(th);
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
    select(selected, false, !!anchor);
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
    if (e.target.tagName === 'INPUT' || e.button !== 0) return;
    const td = e.target.closest('td'), th = e.target.closest('th');
    editing?.finish(true, {}, false);
    // A column or row header selects the whole column or row.
    if (th?.dataset.c !== undefined) { anchor = null; select({ r: 0, c: +th.dataset.c }, false); select({ r: data.rows.length, c: +th.dataset.c }, false, true); grid.focus({ preventScroll: true }); return; }
    if (th?.dataset.r !== undefined) { anchor = null; select({ r: +th.dataset.r, c: 0 }, false); select({ r: +th.dataset.r, c: data.columns.length - 1 }, false, true); grid.focus({ preventScroll: true }); return; }
    if (!td) return;
    select({ r: +td.dataset.r, c: +td.dataset.c }, false, e.shiftKey); grid.focus({ preventScroll: true });
    const drag = move => { const over = document.elementFromPoint(move.clientX, move.clientY)?.closest?.('.sheet-grid td'); if (over && grid.contains(over)) select({ r: +over.dataset.r, c: +over.dataset.c }, true, true); };
    const stop = () => { removeEventListener('pointermove', drag); removeEventListener('pointerup', stop); };
    addEventListener('pointermove', drag); addEventListener('pointerup', stop);
  };
  grid.ondblclick = e => { if (e.target.closest('td')) edit(); };
  grid.onkeydown = e => {
    if (editing || e.target !== grid) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); e.stopPropagation(); anchor = null; select({ r: 0, c: 0 }, false); select({ r: data.rows.length, c: data.columns.length - 1 }, false, true); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const movement = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (movement) { e.preventDefault(); e.stopPropagation(); select({ r: selected.r + movement[0], c: selected.c + movement[1] }, true, e.shiftKey); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); clearRange(); }
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
  function clearRange() {
    const { r0, r1, c0, c1 } = range();
    structure(next => { for (let r = Math.max(1, r0); r <= r1; r++) for (let c = c0; c <= c1; c++) next.rows[r - 1].cells[c] = ''; });
  }
  side.body.querySelector('[data-clear]').onclick = () => clearRange();
  for (const b of side.body.querySelectorAll('[data-sort]')) b.onclick = () => {
    const c = selected.c, dir = Number(b.dataset.sort), kind = data.columns[c].kind;
    const key = text => { const n = Number(String(text).replace(/[,$%\s]/g, '')); return text.trim() === '' ? null : NUMERIC_KINDS.has(kind) || Number.isFinite(n) ? n : text.toLowerCase(); };
    structure(next => next.rows.sort((a, b2) => { const x = key(a.cells[c]), y = key(b2.cells[c]); if (x === null) return 1; if (y === null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * dir; }));
  };
  const kindButton = side.body.querySelector('[data-kind]');
  const kindMenu = createMenu({ trigger: kindButton, label: 'Column type', items: () => Object.entries(KIND_LABEL).map(([kind, title]) => ({ title, checked: data.columns[selected.c].kind === kind,
    run: () => structure(next => { next.columns[selected.c].kind = kind; }) })) });
  side.el.addEventListener('side-editor-close', () => kindMenu.destroy(), { once: true });
  side.body.querySelector('[data-add-row]').onclick = () => structure(next => next.rows.splice(Math.max(selected.r, range().r1), 0, { cells: next.columns.map(() => '') }));
  side.body.querySelector('[data-add-column]').onclick = () => structure(next => { const at = range().c1 + 1; next.columns.splice(at, 0, { label: `Column ${letter(next.columns.length)}`, kind: 'text' }); next.rows.forEach(row => row.cells.splice(at, 0, '')); });
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
