import { documentWordCount, wordCountLabel } from './words.js';
import { resolvePlot } from '../../objects/chart/source.js';
import { formatValue, parseTime, pointText, styleSpec, xText } from '../../objects/chart/chart.ts';
// Shared by the host's lightweight board list and the Library preview.
export const plainLine = value => String(value ?? '').split('\n').find(line => line.trim())?.replace(/^\s*#{1,6}\s+/, '').replace(/[*_`]/g, '').trim().slice(0, 160) || '';
export const cardTitle = card => plainLine(card.props?.layerName || card.heading || card.text || card.props?.name);
const count = (n, singular, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;
const words = text => count(String(text || '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length, 'word');
const heading = text => plainLine(/^\s*#{1,6}\s+(.+)$/m.exec(text || '')?.[1]);
const names = { doc: 'Document', note: 'Note', todo: 'Checklist', deck: 'Deck', slides: 'Deck', dataset: 'Dataset', html: 'Custom UI', plot: 'Plot', sheet: 'Sheet' };

// Data only. Cache these when the board changes, never parse content during a zoom gesture.
export function cardSummary(card, cards = []) {
  const type = card.type === 'object' ? card.kind : card.type;
  const kind = names[type] || `${type?.[0]?.toUpperCase() || ''}${type?.slice(1) || 'Window'}`;
  const data = type === 'plot' ? resolvePlot(card.data || {}, cards) : card.data || {}, props = card.props || {};
  const title = cardTitle(card) || kind;
  let facts = [], preview;
  switch (type) {
    case 'doc': {
      const body = String(props.body || '');
      const excerpt = plainLine(body.split('\n').find(line => line.trim() && !/^\s*#{1,6}\s/.test(line))).split(/(?<=[.!?])\s/)[0];
      facts = [heading(body), excerpt]; break;
    }
    case 'sheet': case 'table': facts = [`${count(data.rows?.length || 0, 'row')} · ${count(data.columns?.length || 0, 'column')}`, plainLine(data.note)]; break;
    case 'dataset': facts = [`${count(props.rows || 0, 'row')} · ${count(props.columns?.length || 0, 'column')}`, plainLine(props.filename || props.source)]; break;
    case 'deck': case 'slides': facts = [count(props.slides?.length || 0, 'slide'), plainLine(props.slides?.[0]?.title)]; break;
    case 'plot': facts = [`${count(data.series?.length || 0, 'series', 'series')} · ${count(data.series?.reduce((n, s) => n + (s.points?.length || 0), 0) || 0, 'point')}`, plainLine(data.basis || data.y?.label)]; break;
    case 'html': facts = [plainLine(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(data.html || '')?.[1]?.replace(/<[^>]*>/g, '')), 'Interactive view']; break;
    case 'stats': facts = (data.tiles || []).slice(0, 2).map(tile => `${tile.label}: ${tile.value}`); break;
    case 'progress': facts = (data.goals || []).slice(0, 2).map(goal => `${goal.current}/${goal.target}${goal.unit ? ` ${goal.unit}` : ''} · ${goal.label}`); break;
    case 'diagram': facts = [`${count(data.nodes?.length || 0, 'node')} · ${count(data.edges?.length || 0, 'connection')}`]; break;
    case 'todo': case 'list': case 'plan': {
      const items = card.items || data.items || data.steps || [];
      facts = [`${items.filter(item => item.done).length}/${count(items.length, 'item')} complete`, plainLine(items[0]?.text || items[0]?.title)]; break;
    }
    case 'callout': case 'reply': facts = [plainLine(data.headline || data.text), plainLine(data.attribution)]; break;
    default: facts = [plainLine(card.heading ? card.text : String(card.text || '').split('\n').slice(1).join('\n')), words(card.text)];
  }
  if (type === 'plot') {
    preview = plotPreview(data);
  } else if (type === 'stats') preview = { type, tiles: (data.tiles || []).slice(0, 2) };
  else if (type === 'progress') preview = { type, goals: (data.goals || []).slice(0, 2) };
  else if (type === 'sheet' || type === 'table') preview = { type: 'sheet', columns: (data.columns || []).slice(0, 3).map(columnLabel), rows: (data.rows || []).slice(0, 2).map(row => (data.columns || []).slice(0, 3).map((column, i) => cellText(column, row.cells?.[i] ?? ''))) };
  else if (type === 'deck' || type === 'slides') preview = { type: 'deck', slide: props.slides?.[0] };
  else if (type === 'diagram') preview = { type, nodes: data.nodes || [], edges: data.edges || [] };
  if (type === 'callout' || type === 'reply') facts = [plainLine(data.headline || data.text).split(/(?<=[.!?])\s/)[0]];
  const disclosure = ['callout', 'reply'].includes(type) ? plainLine(data.attribution) : '';
  // Documents share one word count with the editor footer (lib/board/words.js); it is a secondary detail, not a visible fact.
  const wordCount = type === 'doc' ? wordCountLabel(documentWordCount(card)) : undefined;
  const distinct = facts.filter((fact, i) => fact && !facts.slice(0, i).some(previous => previous?.toLocaleLowerCase() === fact.toLocaleLowerCase()));
  return { title, kind, facts: distinct.slice(0, 2), ...(wordCount ? { wordCount } : {}), ...(preview ? { preview } : {}), ...(disclosure ? { disclosure } : {}) };
}

// Match the sheet editor's header and the typed sheet's figures. Dates and text stay verbatim.
export const columnLabel = column => `${column.label}${column.unit ? ` (${column.unit})` : ''}`;
export function cellText(column, value) {
  const text = String(value ?? '');
  if (!['number', 'money', 'percent', 'duration'].includes(column.kind) || !text.trim()) return text;
  const number = Number(text.replace(/[,\s]/gu, ''));
  if (!Number.isFinite(number)) return text;
  const format = column.kind === 'duration' && column.unit ? 'number' : column.kind;
  return formatValue(number, { format, currency: column.currency });
}

function plotPreview(data) {
  const { kind, stack } = styleSpec(data.style);
  const all = data.series || [];
  const series = all.slice(0, 3).map((entry, i) => {
    const points = [...(entry.points || [])];
    if (data.x?.kind === 'time') points.sort((a, b) => parseTime(String(a.x)) - parseTime(String(b.x)));
    if (data.x?.kind === 'linear') points.sort((a, b) => Number(a.x) - Number(b.x));
    const last = points.at(-1);
    return { name: entry.name || `Series ${i + 1}`, points, value: last && Number.isFinite(last.y) ? pointText(last, data.y) : 'No data', label: last ? xText(last.x, data.x?.kind) : '' };
  });
  const parts = kind === 'donut' && all.length === 1 ? (all[0].points || []).filter(p => Number.isFinite(p.y) && p.y > 0) : [];
  const total = parts.reduce((sum, point) => sum + point.y, 0);
  const first = series[0];
  return { type: 'plot', kind, stack, xKind: data.x?.kind, series, seriesCount: all.length,
    parts: parts.map(p => ({ value: p.y, label: xText(p.x, data.x?.kind) })),
    value: kind === 'donut' && all.length === 1 ? formatValue(total, data.y) : first?.value || 'No data',
    label: kind === 'donut' && all.length === 1 ? count(parts.length, 'segment') : [first?.label, data.y?.label || first?.name].filter(Boolean).join(' · ') };
}
export function boardSubtitle(board) {
  const cards = board?.cards ?? [];
  const heading = cards.find(card => card.type === 'title' && cardTitle(card));
  if (heading) return cardTitle(heading);
  const document = cards.find(card => card.type === 'doc');
  if (document) return cardTitle(document) || plainLine(document.props?.body);
  return cardTitle(cards.find(card => cardTitle(card)) ?? {}) || 'An empty board, ready for an idea.';
}
