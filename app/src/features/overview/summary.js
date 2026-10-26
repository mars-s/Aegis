import { slideHTML } from '../deck/slides.js';
import { parseTime, seriesColor } from '../../objects/chart/chart.ts';

const paths = {
  Document: 'M4 2h8l4 4v16H4zM12 2v5h4M7 11h6M7 15h6M7 19h4',
  Sheet: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16',
  Dataset: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16',
  Deck: 'M3 4h18v13H3zM8 22l4-5 4 5M7 8h10M7 12h6',
  Plot: 'M3 3v18h18M6 16l5-6 4 3 6-8',
  Diagram: 'M3 8h5v8H3zM16 8h5v8h-5zM8 12h8m-3-3 3 3-3 3',
  Progress: 'M3 6h18v4H3zM3 14h18v4H3zM3 6h11v4M3 14h7v4',
  Stats: 'M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7',
  Callout: 'M4 4h16v12H9l-5 4zM8 8h8M8 12h5',
  'Custom UI': 'M8 6l-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',
};

export function summaryContent(summary) {
  const content = document.createElement('span'); content.className = 'semantic-content';
  if (summary.disclosure) content.title = summary.disclosure;
  content.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[summary.kind] || 'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5'}"/></svg><span class="semantic-copy"><span class="semantic-kind"></span><strong></strong></span>`;
  const copy = content.querySelector('.semantic-copy');
  copy.querySelector('.semantic-kind').textContent = summary.kind;
  copy.querySelector('strong').textContent = summary.title;
  const preview = summary.preview;
  if (preview?.type === 'plot' && preview.seriesCount > 1) copy.querySelector('.semantic-kind').textContent += ` · ${preview.seriesCount} series${preview.seriesCount > 3 ? ` (+${preview.seriesCount - 3})` : ''}`;
  const facts = preview && ['plot', 'stats', 'progress', 'sheet', 'diagram'].includes(preview.type) ? [] : summary.facts;
  for (const fact of facts) { const line = document.createElement('span'); line.className = 'semantic-fact'; line.textContent = fact; copy.append(line); }
  if (preview) copy.append(previewContent(preview));
  return content;
}

const element = (tag, className, text) => { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; };
const svg = (width, height, markup, label) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', `0 0 ${width} ${height}`); node.setAttribute('class', 'semantic-graphic');
  node.setAttribute('aria-label', label); node.setAttribute('role', 'img'); node.innerHTML = markup; return node;
};
function previewContent(preview) {
  const root = element('span', `semantic-preview semantic-${preview.type}`);
  if (preview.type === 'plot') {
    root.dataset.plotKind = preview.kind;
    // Three named values take priority over marks that would crowd them out.
    if (preview.seriesCount <= 2) {
      const graphic = plotGraphic(preview);
      if (graphic) root.append(graphic);
    }
    if (preview.seriesCount > 1) {
      root.classList.add('semantic-comparison');
      for (const series of preview.series) {
        const row = element('span', 'semantic-series');
        row.append(element('span', '', series.name), element('span', '', `${series.value}${series.label ? ` · ${series.label}` : ''}`));
        row.title = `${series.name}: ${series.value} ${series.label}`; root.append(row);
      }
    } else {
      const label = element('span', 'semantic-fact'); label.append(element('span', 'semantic-headline', preview.value), document.createTextNode(` ${preview.label}`)); root.append(label);
    }
  } else if (preview.type === 'stats') {
    for (const tile of preview.tiles) { const metric = element('span', 'semantic-stat'); metric.append(element('span', 'semantic-metric', tile.value), element('span', 'semantic-fact', tile.label)); root.append(metric); }
  } else if (preview.type === 'progress') {
    for (const goal of preview.goals) {
      const row = element('span', 'semantic-goal'); row.append(element('span', 'semantic-fact', `${goal.label} · ${goal.current}/${goal.target}`));
      const track = element('span', 'semantic-track'), fill = element('span', 'semantic-fill');
      fill.style.width = `${Math.max(0, Math.min(100, goal.target ? goal.current / goal.target * 100 : 0))}%`; track.append(fill); row.append(track); root.append(row);
    }
  } else if (preview.type === 'sheet') {
    const table = element('table', 'semantic-table'), head = document.createElement('tr');
    for (const name of preview.columns) head.append(element('th', '', name)); table.append(head);
    for (const cells of preview.rows) { const row = document.createElement('tr'); for (const value of cells) row.append(element('td', '', value)); table.append(row); } root.append(table);
  } else if (preview.type === 'deck' && preview.slide) {
    root.setAttribute('aria-label', `First slide: ${preview.slide.title || 'Untitled'}`);
    root.innerHTML = slideHTML(preview.slide); root.setAttribute('aria-hidden', 'true');
  } else if (preview.type === 'diagram') {
    root.append(diagramGraphic(preview) || element('span', 'semantic-fact', `${preview.nodes.length} nodes · ${preview.edges.length} connections`));
  }
  return root;
}

function plotGraphic(preview) {
  if (preview.kind === 'donut' && preview.seriesCount === 1) {
    const total = preview.parts.reduce((sum, part) => sum + part.value, 0);
    if (!total) return null;
    let x = 0;
    const marks = preview.parts.map((part, i) => {
      const width = part.value / total * 96, mark = `<rect x="${x}" y="8" width="${width}" height="12" fill="${seriesColor(i)}" stroke="none"/>`; x += width; return mark;
    }).join('');
    return svg(96, 28, marks, preview.parts.map(p => `${p.label}: ${Math.round(p.value / total * 100)}%`).join(', '));
  }
  if (!['line', 'area', 'bars'].includes(preview.kind)) return null;
  const series = preview.series, keys = [...new Set(series.flatMap(s => s.points.map(p => String(p.x))))];
  const number = x => preview.xKind === 'time' ? parseTime(String(x)) : Number(x);
  if (['time', 'linear'].includes(preview.xKind)) keys.sort((a, b) => number(a) - number(b));
  const values = series.flatMap(s => s.points.filter(p => Number.isFinite(p.y)).map(p => p.y));
  if (!values.length) return null;
  const min = Math.min(...values, ...(preview.kind === 'bars' ? [0] : [])), max = Math.max(...values, ...(preview.kind === 'bars' ? [0] : [])), range = max - min || 1;
  const y = value => 26 - (value - min) / range * 24;
  const x = key => {
    if (preview.kind === 'bars') return 2 + (keys.indexOf(String(key)) + .5) / keys.length * 92;
    if (['time', 'linear'].includes(preview.xKind)) return 2 + (number(key) - number(keys[0])) / (number(keys.at(-1)) - number(keys[0]) || 1) * 92;
    return 2 + keys.indexOf(String(key)) / Math.max(1, keys.length - 1) * 92;
  };
  const marks = series.map((entry, i) => {
    const points = keys.map(key => entry.points.find(p => String(p.x) === key));
    if (preview.kind === 'bars') {
      const width = 80 / Math.max(1, keys.length) / Math.max(1, series.length);
      return points.filter(p => p && Number.isFinite(p.y)).map(p => `<rect x="${x(p.x) - width * series.length / 2 + i * width}" y="${Math.min(y(0), y(p.y))}" width="${width}" height="${Math.abs(y(p.y) - y(0))}" fill="${seriesColor(i)}" stroke="none"/>`).join('');
    }
    let connected = false;
    const path = points.map(p => {
      if (!p || !Number.isFinite(p.y)) { connected = false; return ''; }
      const command = connected ? 'L' : 'M'; connected = true; return `${command}${x(p.x)} ${y(p.y)}`;
    }).join(' ');
    const dots = points.filter(p => p && Number.isFinite(p.y)).map(p => `<circle cx="${x(p.x)}" cy="${y(p.y)}" r="1" fill="${seriesColor(i)}" stroke="none"/>`).join('');
    return `<g stroke="${seriesColor(i)}"><path d="${path}"/>${dots}</g>`;
  }).join('');
  return svg(96, 28, marks, `${preview.kind === 'bars' ? 'Bars' : 'Lines'}: ${series.map(s => s.name).join(', ')}`);
}

function diagramGraphic({ nodes, edges }) {
  // A tiny graph must fit every node and edge. Larger, cyclic or labelled graphs use counts.
  if (!nodes.length || nodes.length > 4 || edges.some(e => e.label)) return null;
  const positions = new Map(nodes.map(n => [n.id, { node: n, rank: 0, incoming: edges.filter(e => e.to === n.id).length }]));
  if (edges.some(e => !positions.has(e.from) || !positions.has(e.to))) return null;
  const queue = [...positions.values()].filter(p => !p.incoming);
  let visited = 0;
  for (const current of queue) {
    visited++;
    for (const edge of edges.filter(e => e.from === current.node.id)) {
      const next = positions.get(edge.to); next.rank = Math.max(next.rank, current.rank + 1);
      if (--next.incoming === 0) queue.push(next);
    }
  }
  if (visited !== nodes.length) return null;
  const ranks = Array.from({ length: Math.max(...queue.map(p => p.rank)) + 1 }, (_, i) => queue.filter(p => p.rank === i));
  if (ranks.some(rank => rank.length > 2)) return null;
  const widths = ranks.map(rank => Math.max(...rank.map(p => p.node.name.length * 8 + 8)));
  if (widths.reduce((sum, w) => sum + w, 0) + (ranks.length - 1) * 6 > 188) return null;
  if (edges.some(e => positions.get(e.to).rank !== positions.get(e.from).rank + 1)) return null;
  let left = 0;
  ranks.forEach((rank, i) => { rank.forEach((p, j) => Object.assign(p, { x: left, y: rank.length === 1 ? 12 : j * 22, w: widths[i] })); left += widths[i] + 6; });
  const markup = edges.map(edge => { const a = positions.get(edge.from), b = positions.get(edge.to); return `<path data-from="${nodes.indexOf(a.node)}" data-to="${nodes.indexOf(b.node)}" d="M${a.x + a.w} ${a.y + 8}L${b.x} ${b.y + 8}m-3-2 3 2-3 2"/>`; }).join('');
  const graphic = svg(188, 40, markup, edges.length ? edges.map(e => `${positions.get(e.from).node.name} to ${positions.get(e.to).node.name}`).join(', ') : `${nodes.length} unconnected nodes`);
  for (const p of queue) {
    const rect = document.createElementNS(graphic.namespaceURI, 'rect');
    for (const [key, value] of Object.entries({ x: p.x, y: p.y, width: p.w, height: 16 })) rect.setAttribute(key, String(value)); graphic.append(rect);
    const label = document.createElementNS(graphic.namespaceURI, 'text'); label.setAttribute('x', String(p.x + 4)); label.setAttribute('y', String(p.y + 12)); label.textContent = p.node.name; graphic.append(label);
  }
  return graphic;
}
