import { slideHTML, observeSlideFits } from '../deck/slides.js';
import { parseTime, seriesColor } from '@aegis/domain/charts';

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
  if (summary.sourceStatus) { content.classList.add('has-source-status'); copy.append(element('span', 'semantic-source-status', summary.sourceStatus)); }
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
    let graphic;
    // Three named values take priority over marks that would crowd them out.
    if (preview.seriesCount <= 2) {
      graphic = plotGraphic(preview);
    }
    if (preview.seriesCount > 1) {
      root.classList.add('semantic-comparison');
      if (graphic) root.append(graphic);
      for (const series of preview.series) {
        const row = element('span', 'semantic-series');
        row.append(element('span', '', series.name), element('span', '', `${series.value}${series.label ? ` · ${series.label}` : ''}`));
        row.title = `${series.name}: ${series.value} ${series.label}`; root.append(row);
      }
    } else {
      root.classList.add('semantic-single');
      root.append(element('span', 'semantic-headline', preview.value));
      if (graphic) root.append(graphic);
      root.append(element('span', 'semantic-fact', preview.label));
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
    requestAnimationFrame(() => { if (root.isConnected) { observeSummaryRemoval(); summaryFits.set(root, observeSlideFits(root)); } });
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
  if (!['line', 'area', 'bars', 'stacked'].includes(preview.kind) || preview.stack) return null;
  const bars = ['bars', 'stacked'].includes(preview.kind), stacked = preview.kind === 'stacked';
  const series = preview.series, keys = [...new Set(series.flatMap(s => s.points.map(p => String(p.x))))];
  const number = x => preview.xKind === 'time' ? parseTime(String(x)) : Number(x);
  if (['time', 'linear'].includes(preview.xKind)) keys.sort((a, b) => number(a) - number(b));
  const values = series.flatMap(s => s.points.filter(p => Number.isFinite(p.y)).map(p => p.y));
  if (!values.length) return null;
  const totals = keys.map(key => series.map(s => s.points.find(p => String(p.x) === key)?.y).filter(Number.isFinite));
  const lows = stacked ? totals.map(values => values.reduce((sum, v) => sum + Math.min(0, v), 0)) : values;
  const highs = stacked ? totals.map(values => values.reduce((sum, v) => sum + Math.max(0, v), 0)) : values;
  const min = Math.min(...lows, ...(bars ? [0] : [])), max = Math.max(...highs, ...(bars ? [0] : [])), range = max - min || 1;
  const y = value => 26 - (value - min) / range * 24;
  const x = key => {
    if (bars) return 2 + (keys.indexOf(String(key)) + .5) / keys.length * 92;
    if (['time', 'linear'].includes(preview.xKind)) return 2 + (number(key) - number(keys[0])) / (number(keys.at(-1)) - number(keys[0]) || 1) * 92;
    return 2 + keys.indexOf(String(key)) / Math.max(1, keys.length - 1) * 92;
  };
  const marks = series.map((entry, i) => {
    const points = keys.map(key => entry.points.find(p => String(p.x) === key));
    if (bars) {
      const width = 80 / Math.max(1, keys.length) / (stacked ? 1 : Math.max(1, series.length));
      return points.filter(p => p && Number.isFinite(p.y)).map(p => {
        const baseline = stacked ? series.slice(0, i).map(s => s.points.find(other => String(other.x) === String(p.x))?.y).filter(v => Number.isFinite(v) && (v < 0) === (p.y < 0)).reduce((sum, v) => sum + v, 0) : 0;
        const left = stacked ? x(p.x) - width / 2 : x(p.x) - width * series.length / 2 + i * width;
        return `<rect x="${left}" y="${Math.min(y(baseline), y(baseline + p.y))}" width="${width}" height="${Math.abs(y(baseline + p.y) - y(baseline))}" fill="${seriesColor(i)}" stroke="none"/>`;
      }).join('');
    }
    let connected = false;
    const path = points.map(p => {
      if (!p || !Number.isFinite(p.y)) { connected = false; return ''; }
      const command = connected ? 'L' : 'M'; connected = true; return `${command}${x(p.x)} ${y(p.y)}`;
    }).join(' ');
    const dots = points.filter(p => p && Number.isFinite(p.y)).map(p => `<circle cx="${x(p.x)}" cy="${y(p.y)}" r="1" fill="${seriesColor(i)}" stroke="none"/>`).join('');
    return `<g stroke="${seriesColor(i)}"><path d="${path}"/>${dots}</g>`;
  }).join('');
  return svg(96, 28, marks, `${bars ? 'Bars' : 'Lines'}: ${series.map(s => s.name).join(', ')}`);
}

// Every position follows real edges. Chains can fold into two rows without losing a step.
export function diagramLayout({ nodes, edges }, width, height = 52, textWidth = name => name.length * 7) {
  if (!nodes.length || nodes.length > 6 || edges.some(edge => edge.label)) return null;
  const positions = new Map(nodes.map(node => [node.id, { node, rank: 0, incoming: edges.filter(edge => edge.to === node.id).length, w: Math.ceil(textWidth(node.name)) + 12 }]));
  if (positions.size !== nodes.length || edges.some(edge => !positions.has(edge.from) || !positions.has(edge.to))) return null;
  const queue = [...positions.values()].filter(position => !position.incoming);
  let visited = 0;
  for (const current of queue) {
    visited++;
    for (const edge of edges.filter(edge => edge.from === current.node.id)) {
      const next = positions.get(edge.to); next.rank = Math.max(next.rank, current.rank + 1);
      if (--next.incoming === 0) queue.push(next);
    }
  }
  if (visited !== nodes.length) return null;
  const ranks = Array.from({ length: Math.max(...queue.map(position => position.rank)) + 1 }, (_, i) => queue.filter(position => position.rank === i));
  const widths = ranks.map(rank => Math.max(...rank.map(position => position.w)));
  const needed = widths.reduce((sum, w) => sum + w, 0) + (ranks.length - 1) * 12;
  const chain = ranks.every(rank => rank.length === 1) && edges.length === nodes.length - 1;
  if (needed > width && chain && nodes.length <= 4 && height >= 48) {
    const order = ranks.flat(), left = Math.max(...order.filter((_, i) => i === 0 || i === 3).map(position => position.w));
    const right = Math.max(...order.filter((_, i) => i === 1 || i === 2).map(position => position.w));
    if (left + right + 12 > width) return null;
    order.forEach((position, i) => Object.assign(position, { x: i === 0 || i === 3 ? 1 : width - position.w - 1, y: i < 2 ? 1 : height - 21 }));
  } else {
    if (needed > width || ranks.some(rank => rank.length > 2) || edges.some(edge => positions.get(edge.to).rank !== positions.get(edge.from).rank + 1)) return null;
    let left = 1;
    ranks.forEach((rank, i) => {
      rank.forEach((position, j) => Object.assign(position, { x: left, y: rank.length === 1 ? (height - 20) / 2 : j ? height - 21 : 1 }));
      left += widths[i] + 12;
    });
  }
  return { nodes: nodes.map(node => positions.get(node.id)), edges: edges.map(edge => {
    const a = positions.get(edge.from), b = positions.get(edge.to);
    let x1, y1, x2, y2;
    if (a.y === b.y) {
      const forward = b.x > a.x;
      x1 = forward ? a.x + a.w : a.x; x2 = forward ? b.x : b.x + b.w; y1 = y2 = a.y + 10;
    } else if (chain) {
      x1 = a.x + a.w / 2; x2 = b.x + b.w / 2; y1 = a.y + 20; y2 = b.y;
    } else { x1 = a.x + a.w; x2 = b.x; y1 = a.y + 10; y2 = b.y + 10; }
    const angle = Math.atan2(y2 - y1, x2 - x1), dx = Math.cos(angle), dy = Math.sin(angle);
    return { from: nodes.indexOf(a.node), to: nodes.indexOf(b.node), d: `M${x1} ${y1}L${x2} ${y2}m${-3 * dx + 2 * dy} ${-3 * dy - 2 * dx}l${3 * dx - 2 * dy} ${3 * dy + 2 * dx}l${-3 * dx - 2 * dy} ${-3 * dy + 2 * dx}` };
  }) };
}

const diagrams = new Map();
const summaryFits = new Map();
let diagramResize, summaryRemoval;
function observeSummaryRemoval() {
  if (summaryRemoval) return;
  summaryRemoval = new MutationObserver(() => {
    for (const node of diagrams.keys()) if (!node.isConnected) { diagramResize.unobserve(node); diagrams.delete(node); }
    for (const [node, drop] of summaryFits) if (!node.isConnected) { drop(); summaryFits.delete(node); }
  });
  summaryRemoval.observe(document.getElementById('stage') || document.body, { childList: true, subtree: true });
}
function diagramGraphic(preview) {
  const root = element('span', 'semantic-diagram-fit');
  const render = () => {
    const width = root.clientWidth, height = root.clientHeight;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `12px ${getComputedStyle(root).fontFamily}`;
    const layout = diagramLayout(preview, width, height, name => measure.measureText(name).width);
    if (!layout) { root.replaceChildren(element('span', 'semantic-fact', `${preview.nodes.length} nodes · ${preview.edges.length} connections`)); return; }
    const label = preview.edges.length ? preview.edges.map(edge => `${preview.nodes.find(node => node.id === edge.from).name} to ${preview.nodes.find(node => node.id === edge.to).name}`).join(', ') : `${preview.nodes.length} unconnected nodes`;
    const graphic = svg(width, height, layout.edges.map(edge => `<path data-from="${edge.from}" data-to="${edge.to}" d="${edge.d}"/>`).join(''), label);
    for (const position of layout.nodes) {
      const rect = document.createElementNS(graphic.namespaceURI, 'rect');
      for (const [key, value] of Object.entries({ x: position.x, y: position.y, width: position.w, height: 20 })) rect.setAttribute(key, String(value)); graphic.append(rect);
      const text = document.createElementNS(graphic.namespaceURI, 'text'); text.setAttribute('x', String(position.x + 6)); text.setAttribute('y', String(position.y + 14)); text.textContent = position.node.name; graphic.append(text);
    }
    root.replaceChildren(graphic);
  };
  if (!diagramResize) {
    diagramResize = new ResizeObserver(entries => { for (const { target } of entries) diagrams.get(target)?.(); });
    observeSummaryRemoval();
  }
  requestAnimationFrame(() => { if (root.isConnected) { diagrams.set(root, render); diagramResize.observe(root); render(); } });
  return root;
}
