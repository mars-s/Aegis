import './data.css';
import { registerRenderer } from '../../canvas/engine.js';
import { DATASET_LIMITS, parseCsv, profileDataset } from '@aegis/domain/dataset';
import { registerCommand, registerCardMenu } from '../registry';
import { openDataset } from './viewer.js';

// A dataset window: the file stays whole as an asset; the window previews its first rows and column types.
const isData = file => /\.(csv|tsv)$/i.test(file.name) || ['text/csv', 'text/tab-separated-values', 'application/vnd.ms-excel'].includes(file.type);
export { isData };
const KIND_MARK = { number: '#', date: '◷', text: 'Aa' };
const fmt = n => typeof n === 'number' ? n.toLocaleString('en-AU', { maximumFractionDigits: 2 }) : n;

export async function importDataset(ctx, file, at) {
  if (file.size > DATASET_LIMITS.bytes) { ctx.toast(`${file.name} is over ${DATASET_LIMITS.bytes / 1024 ** 2} MB.`); return; }
  try {
    const text = await file.text(), parsed = parseCsv(text), profile = profileDataset(parsed);
    const type = /\.tsv$/i.test(file.name) ? 'text/tab-separated-values' : 'text/csv';
    const saved = await ctx.host.upload(new File([text], file.name, { type }));
    const preview = parsed.rows.slice(0, 40).map(r => r.map(v => v.slice(0, 60)));
    ctx.apply([{ op: 'create', type: 'dataset', text: file.name.replace(/\.(csv|tsv)$/i, ''), x: Math.round(at.x), y: Math.round(at.y), w: 640, h: 420, ref: 'd',
      props: { src: saved.url, name: file.name, rows: parsed.rows.length, columns: parsed.columns, preview, profile } }], created => ctx.canvas.select([created.d]));
    ctx.toast(`Imported ${parsed.rows.length.toLocaleString()} rows from ${file.name}. Ask the agent to analyse it.`);
  } catch (error) { ctx.toast(`Could not read ${file.name}: ${error.message}`); }
}

registerRenderer('dataset', {
  render(el, card) {
    const p = card.props ?? {}, columns = p.columns ?? [], profile = p.profile?.columns ?? [];
    el.setAttribute('aria-label', `${card.text}, dataset with ${p.rows ?? 0} rows`);
    el.innerHTML = `<header class="win-strip doc-strip"><span class="win-name"></span><span class="win-kind">\u00a0· Data</span><span class="data-size"></span><button class="win-open" type="button">Open</button></header>
      <div class="data-cols" aria-label="Columns"></div><div class="data-scroll"><table class="data-grid"><thead><tr><th></th></tr></thead><tbody></tbody></table></div>`;
    el.querySelector('.win-name').textContent = card.text || p.name || 'Dataset';
    el.querySelector('.win-open').onclick = event => { if (globalThis.aegisCtx) openDataset(card, globalThis.aegisCtx, { keyboard: event.detail === 0 }); };
    el.querySelector('.data-size').textContent = `${(p.rows ?? 0).toLocaleString()} rows · ${columns.length} columns`;
    // Column chips: kind and the one figure that matters (range, or distinct values), gaps flagged.
    const chips = el.querySelector('.data-cols');
    for (const c of profile) {
      const chip = document.createElement('span'); chip.className = `data-col kind-${c.kind}`;
      const mark = document.createElement('b'); mark.textContent = KIND_MARK[c.kind] ?? 'Aa';
      const name = document.createElement('span'); name.textContent = c.name;
      chip.append(mark, name);
      chip.title = c.kind === 'number' ? `${fmt(c.min)} to ${fmt(c.max)}, mean ${fmt(c.mean)}` : c.kind === 'date' ? `${c.min} to ${c.max}` : `${c.distinct} distinct${c.top?.[0] ? `, most often ${c.top[0].value}` : ''}`;
      if (c.empty) { const gap = document.createElement('i'); gap.textContent = c.empty === p.rows ? 'empty' : `${c.empty} blank`; chip.append(gap); }
      chips.append(chip);
    }
    const head = el.querySelector('thead tr'), body = el.querySelector('tbody');
    const numeric = new Set(profile.filter(c => c.kind === 'number').map(c => c.name));
    for (const name of columns) { const th = document.createElement('th'); th.textContent = name; if (numeric.has(name)) th.className = 'num'; head.append(th); }
    (p.preview ?? []).forEach((row, r) => {
      const tr = body.insertRow(); const n = document.createElement('th'); n.textContent = String(r + 1); tr.append(n);
      row.forEach((value, i) => { const td = tr.insertCell(); td.textContent = value; if (numeric.has(columns[i])) td.className = 'num'; });
    });
    if ((p.rows ?? 0) > (p.preview?.length ?? 0)) {
      const tr = body.insertRow(), td = tr.insertCell(); td.colSpan = columns.length + 1; td.className = 'data-more';
      td.textContent = `${((p.rows ?? 0) - (p.preview?.length ?? 0)).toLocaleString()} more rows. Open to explore every row.`;
    }
  },
  open(card) { if (globalThis.aegisCtx) openDataset(card, globalThis.aegisCtx); },
  interactive: '.data-scroll, .win-open',
});

const selectedDataset = ctx => ctx.selection().length === 1 && ctx.canvas.board.cards.find(card => card.id === ctx.selection()[0] && card.type === 'dataset');
registerCommand({ id: 'data-open', title: 'Open selected dataset', keys: 'enter', when: ctx => !document.activeElement?.closest('.side-editor') && !!selectedDataset(ctx), run: ctx => openDataset(selectedDataset(ctx), ctx, { keyboard: true }) });
registerCardMenu({ id: 'data-open', title: 'Open data', section: 'Data', when: (ctx, ids) => ids.length === 1 && ctx.canvas.board.cards.some(card => card.id === ids[0] && card.type === 'dataset'), run: (ctx, ids) => openDataset(ctx.canvas.board.cards.find(card => card.id === ids[0]), ctx) });

// The screen-space window action strip opens cards through this event, like documents, sheets and decks.
window.addEventListener('aegis:open-card', event => {
  const ctx = globalThis.aegisCtx, card = ctx?.canvas.board.cards.find(c => c.id === event.detail?.id);
  if (card?.type === 'dataset') openDataset(card, ctx, { keyboard: event.detail?.keyboard ?? false });
});
