import { mount, unmount } from 'svelte';
import Chart from '../../objects/chart/Chart.svelte';
import { styleSpec } from '../../objects/chart/chart.ts';
import { resolvePlot } from '../../objects/chart/source.js';
import { parseCsv } from '../../lib/board/dataset.js';

export const referenceCard = card => card.kind === 'plot' || card.kind === 'sheet' || card.type === 'dataset';

export function liveReference(root, canvas) {
  let chart, key = '', version = 0, closed = false, loaded, asset;
  const content = document.createElement('div'); root.append(content);
  const controls = document.createElement('div'); controls.className = 'editor-reference-region';
  const row = document.createElement('input'), column = document.createElement('input');
  for (const [input, label] of [[row, 'Reference first row'], [column, 'Reference first column']]) {
    input.type = 'number'; input.min = '1'; input.value = '1'; input.setAttribute('aria-label', label);
    const field = document.createElement('label'); field.textContent = label.endsWith('row') ? 'Row' : 'Column'; field.append(input); controls.append(field);
  }
  let current;
  row.onchange = column.onchange = () => { key = ''; void update(current); };
  function clear() { if (chart) { void unmount(chart); chart = null; } content.replaceChildren(); }
  async function update(card) {
    if (!card || closed) return;
    current = card;
    const request = ++version;
    if (card.kind === 'plot') {
      controls.remove(); content.className = 'editor-reference-chart';
      const data = resolvePlot(card.data, canvas.board.cards), next = JSON.stringify(data);
      if (next === key) return;
      key = next; clear();
      chart = mount(Chart, { target: content, props: { title: card.text || 'Chart', height: 164,
        spec: { ...styleSpec(data.style), x: data.x, y: data.y, series: data.series, smooth: data.smooth, values: false } } });
      return;
    }
    let columns, rows;
    if (card.kind === 'sheet') { columns = card.data.columns.map(c => c.label); rows = card.data.rows.map(r => r.cells); }
    else {
      if (asset !== card.props.src) {
        asset = card.props.src; loaded = null;
        content.textContent = 'Loading reference…';
        try {
          const host = globalThis.aegisCtx.host;
          const response = await fetch(host.assetUrl(asset));
          if (!response.ok) throw Error('Source unavailable');
          const parsed = parseCsv(await response.text());
          if (closed || request !== version) return;
          loaded = parsed;
        } catch {
          if (!closed && request === version) { clear(); content.textContent = 'Could not load this reference. Open the dataset to try again.'; }
          asset = null; return;
        }
      }
      if (!loaded) return;
      ({ columns, rows } = loaded);
    }
    if (closed || request !== version) return;
    content.className = 'editor-reference-table'; root.append(controls);
    const start = Math.max(0, Math.min(rows.length - 1, (Number(row.value) || 1) - 1));
    const first = Math.max(0, Math.min(columns.length - 1, (Number(column.value) || 1) - 1));
    row.value = String(start + 1); row.max = String(Math.max(1, rows.length));
    column.value = String(first + 1); column.max = String(columns.length);
    const next = JSON.stringify([columns, rows.slice(start, start + 4), start, first]);
    if (next === key) return;
    key = next; clear();
    const table = document.createElement('table'); table.setAttribute('aria-label', `${card.text || 'Data'} reference, rows ${start + 1} to ${Math.min(rows.length, start + 4)}`);
    const head = table.createTHead().insertRow();
    for (const title of columns.slice(first, first + 2)) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; th.title = title; head.append(th); }
    const body = table.createTBody();
    for (const values of rows.slice(start, start + 4)) {
      const tr = body.insertRow();
      for (const value of values.slice(first, first + 2)) { const td = tr.insertCell(); td.textContent = value; td.title = value; }
    }
    content.append(table);
  }
  return { update, destroy() { closed = true; version++; clear(); } };
}
