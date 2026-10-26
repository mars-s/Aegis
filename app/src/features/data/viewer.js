import { openSide, centreCardInLeft } from '../docs/side.js';

const ROW_HEIGHT = 32, HEADER_HEIGHT = 48, ROW_NUMBER_WIDTH = 76, OVERSCAN = 6;
const fmt = value => typeof value === 'number' ? value.toLocaleString('en-AU', { maximumFractionDigits: 2 }) : String(value);
const kindName = kind => ({ number: 'Number', date: 'Date', text: 'Text' }[kind] ?? 'Text');
let active;

export function openDataset(card, ctx, { keyboard = false } = {}) {
  const boardId = ctx.canvas.board.id;
  if (active?.id === card.id && active.boardId === boardId) { active.focus(); return; }
  const side = openSide({ title: card.text || card.props?.name || 'Dataset', kind: 'Data', keyboard });
  side.el.classList.add('data-viewer');
  side.setSaved('Read only');
  side.body.innerHTML = `<div class="data-viewer-tools"><span data-size></span><label class="data-finder-label">Find column<input type="search" aria-label="Find column" placeholder="Column name" autocomplete="off"></label><select aria-label="Go to column"></select></div><details class="data-profile"><summary>Column profile</summary><div data-profile-content></div></details><div class="data-viewport" tabindex="0" role="region" aria-label="Dataset rows" aria-busy="true"><p class="data-message" role="status">Loading source data…</p></div><footer class="data-viewer-status" role="status">Loading every row from the source file</footer>`;
  const viewport = side.body.querySelector('.data-viewport'), status = side.body.querySelector('.data-viewer-status');
  const finder = side.body.querySelector('input'), picker = side.body.querySelector('select'), details = side.body.querySelector('details');
  picker.disabled = true; finder.disabled = true;
  let worker, columns = [], profile, total = 0, tbody, headers = [], request = 0, frame, lastRange = '', sortColumn = -1, sortDirection = 1, closed = false;
  const offsets = [];
  function requestRows(force = false) {
    if (!tbody || closed) return;
    const start = Math.max(0, Math.floor((viewport.scrollTop - HEADER_HEIGHT) / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(total, start + Math.ceil(viewport.clientHeight / ROW_HEIGHT) + OVERSCAN * 2 + 2);
    const range = `${start}:${end}`;
    if (!force && range === lastRange) return;
    lastRange = range;
    worker.postMessage({ type: 'rows', start, end, request: ++request });
  }
  function scheduleRows() { if (!frame) frame = requestAnimationFrame(() => { frame = null; requestRows(); }); }
  function drawRows({ start, rows }) {
    const fragment = document.createDocumentFragment();
    const spacer = height => {
      const row = document.createElement('tr'); row.setAttribute('aria-hidden', 'true'); row.className = 'data-spacer';
      const cell = row.insertCell(); cell.colSpan = columns.length + 1; cell.style.height = `${height}px`; fragment.append(row);
    };
    spacer(start * ROW_HEIGHT);
    rows.forEach((row, offset) => {
      const tr = document.createElement('tr'); tr.setAttribute('aria-rowindex', String(start + offset + 2));
      const number = document.createElement('th'); number.scope = 'row'; number.textContent = String(row.number); tr.append(number);
      row.cells.forEach((value, column) => {
        const td = document.createElement('td'); td.textContent = value; td.title = value;
        td.classList.toggle('num', profile.columns[column].kind === 'number'); tr.append(td);
      });
      fragment.append(tr);
    });
    spacer((total - start - rows.length) * ROW_HEIGHT);
    tbody.replaceChildren(fragment);
    const first = Math.min(total, Math.floor(viewport.scrollTop / ROW_HEIGHT) + 1), last = Math.min(total, Math.ceil((viewport.scrollTop + viewport.clientHeight - HEADER_HEIGHT) / ROW_HEIGHT));
    status.textContent = total ? `Rows ${fmt(first)}–${fmt(last)} of ${fmt(total)}${sortColumn >= 0 ? ` · ${columns[sortColumn]}, ${sortDirection === 1 ? 'ascending' : 'descending'}` : ''}` : 'No data rows';
    viewport.setAttribute('aria-busy', 'false');
  }
  function showProfile() {
    if (!profile) return;
    const column = profile.columns[Number(picker.value) || 0], content = side.body.querySelector('[data-profile-content]');
    content.replaceChildren();
    const title = document.createElement('p'); title.className = 'data-profile-title'; title.textContent = column.name;
    const chip = document.createElement('span'); chip.className = `data-kind kind-${column.kind}`; chip.textContent = kindName(column.kind); title.append(chip); content.append(title);
    const stats = document.createElement('dl');
    for (const [name, value] of [['Range', column.min === undefined ? null : `${fmt(column.min)} to ${fmt(column.max)}`], ['Mean', column.mean], ['Median', column.median], ['Gaps', `${fmt(column.empty)} of ${fmt(total)}`], ['Distinct values', column.distinct]]) {
      if (value === undefined || value === null) continue;
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = name; dd.textContent = fmt(value); stats.append(dt, dd);
    }
    content.append(stats);
    if (column.top?.length) {
      const label = document.createElement('p'); label.textContent = 'Top values'; label.className = 'data-profile-title'; content.append(label);
      const list = document.createElement('ul');
      for (const { value, count } of column.top) { const item = document.createElement('li'), number = document.createElement('span'); item.textContent = value; number.textContent = fmt(count); item.append(number); list.append(item); }
      content.append(list);
    }
  }
  function revealColumn() {
    const column = Number(picker.value); if (!Number.isInteger(column) || !headers[column]) return;
    viewport.scrollLeft = offsets[column] - ROW_NUMBER_WIDTH;
    for (const [i, header] of headers.entries()) header.classList.toggle('is-found', i === column);
    showProfile();
  }
  function findColumns() {
    const query = finder.value.trim().toLocaleLowerCase(), previous = picker.value;
    picker.replaceChildren();
    columns.forEach((name, column) => {
      if (!name.toLocaleLowerCase().includes(query)) return;
      const option = document.createElement('option'); option.value = String(column); option.textContent = name; picker.append(option);
    });
    picker.disabled = !picker.options.length;
    if ([...picker.options].some(option => option.value === previous)) picker.value = previous;
    if (!picker.disabled) revealColumn();
    else status.textContent = 'No matching columns';
  }
  function buildTable() {
    const table = document.createElement('table'); table.className = 'data-viewer-grid'; table.setAttribute('aria-label', card.text || 'Dataset'); table.setAttribute('aria-rowcount', String(total + 1));
    const colgroup = document.createElement('colgroup'), first = document.createElement('col'); first.style.width = `${ROW_NUMBER_WIDTH}px`; colgroup.append(first);
    let left = ROW_NUMBER_WIDTH;
    offsets.length = 0;
    columns.forEach((name, column) => { const col = document.createElement('col'); const width = profile.columns[column].kind === 'number' ? 156 : 204; offsets.push(left); left += width; col.style.width = `${width}px`; colgroup.append(col); });
    table.style.width = `${left}px`; table.append(colgroup);
    const head = table.createTHead().insertRow(), corner = document.createElement('th'); corner.scope = 'col'; corner.textContent = 'Row'; head.append(corner);
    headers = columns.map((name, column) => {
      const th = document.createElement('th'); th.scope = 'col'; th.setAttribute('aria-sort', 'none');
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', `Sort by ${name}`);
      const title = document.createElement('span'); title.className = 'data-column-name'; title.textContent = name;
      const chip = document.createElement('span'); chip.className = `data-kind kind-${profile.columns[column].kind}`; chip.textContent = kindName(profile.columns[column].kind);
      const arrow = document.createElement('span'); arrow.className = 'data-sort'; arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = '<svg viewBox="0 0 16 16"><path d="M8 3v10m-4-4 4 4 4-4"/></svg>';
      button.append(title, chip, arrow); th.append(button); head.append(th);
      button.onclick = () => {
        sortDirection = sortColumn === column ? -sortDirection : 1; sortColumn = column;
        viewport.setAttribute('aria-busy', 'true'); status.textContent = `Sorting ${name}…`;
        picker.value = String(column); showProfile();
        worker.postMessage({ type: 'sort', column, direction: sortDirection });
      };
      return th;
    });
    tbody = table.createTBody(); viewport.replaceChildren(table);
    side.body.querySelector('[data-size]').textContent = `${fmt(total)} rows · ${columns.length} columns`;
    finder.disabled = false; findColumns(); requestRows(true);
  }
  function fail(message) {
    viewport.setAttribute('aria-busy', 'false'); viewport.replaceChildren();
    const text = document.createElement('p'); text.className = 'data-message'; text.textContent = `Could not load the dataset. ${message}`;
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'data-retry'; retry.textContent = 'Try again'; retry.onclick = load;
    viewport.append(text, retry); status.textContent = 'Source data unavailable';
  }
  function load() {
    worker?.terminate();
    if (!card.props?.src?.startsWith('asset:')) { fail('Import the source CSV again.'); return; }
    viewport.setAttribute('aria-busy', 'true'); status.textContent = 'Loading every row from the source file';
    worker = new Worker(new URL('./viewer-worker.js', import.meta.url), { type: 'module' });
    worker.onerror = () => fail('Close the viewer and try again.');
    worker.onmessage = ({ data: message }) => {
      if (closed) return;
      if (message.type === 'ready') { ({ columns, profile, total } = message); buildTable(); }
      else if (message.type === 'rows' && message.request === request) drawRows(message);
      else if (message.type === 'sorted') {
        headers.forEach((header, column) => header.setAttribute('aria-sort', column === message.column ? message.direction === 1 ? 'ascending' : 'descending' : 'none'));
        viewport.scrollTop = 0; requestRows(true);
      } else if (message.type === 'error') fail(message.message);
    };
    worker.postMessage({ type: 'load', url: ctx.host.assetUrl(card.props.src) });
  }
  finder.oninput = findColumns; finder.onkeydown = event => { if (event.key === 'Enter' && !picker.disabled) { event.preventDefault(); revealColumn(); headers[Number(picker.value)].querySelector('button').focus(); } };
  picker.onchange = revealColumn;
  viewport.addEventListener('scroll', scheduleRows, { passive: true });
  const observer = new ResizeObserver(scheduleRows); observer.observe(viewport);
  const keys = event => { if (side.el.contains(event.target) && ['Backspace', 'Delete'].includes(event.key) && !event.target.matches('input')) { event.preventDefault(); event.stopImmediatePropagation(); } };
  window.addEventListener('keydown', keys, true);
  const watch = () => { if (ctx.canvas.board.id !== boardId || !ctx.canvas.board.cards.some(c => c.id === card.id)) side.close({ keyboard: true }); };
  document.getElementById('stage').addEventListener('boardchange', watch);
  side.el.addEventListener('side-editor-close', () => {
    closed = true; worker?.terminate(); observer.disconnect(); cancelAnimationFrame(frame);
    window.removeEventListener('keydown', keys, true); document.getElementById('stage').removeEventListener('boardchange', watch);
    if (active?.id === card.id) active = null;
  }, { once: true });
  details.addEventListener('toggle', scheduleRows);
  active = { id: card.id, boardId, focus: () => finder.focus() };
  centreCardInLeft(card, ctx, keyboard); viewport.focus({ preventScroll: true }); load();
}
