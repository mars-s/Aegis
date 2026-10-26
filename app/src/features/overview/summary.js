import { slideHTML } from '../deck/slides.js';

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
    const values = preview.values, min = Math.min(...values), range = Math.max(...values) - min || 1;
    const points = values.map((v, i) => `${2 + i / Math.max(1, values.length - 1) * 92},${26 - (v - min) / range * 24}`);
    root.append(svg(96, 28, `<polyline points="${points.join(' ')}"/>`, 'Trend for the first series'));
    const label = element('span', 'semantic-fact'); label.append(element('span', 'semantic-headline', preview.value), document.createTextNode(` ${preview.label}`)); root.append(label);
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
    root.append(element('span', 'semantic-fact semantic-flow', preview.nodes.map(node => node.name).join(' → ')));
    root.append(svg(160, 18, preview.nodes.map((node, i) => `<rect x="${i * 40 + 1}" y="2" width="30" height="14"/>`).join('') + preview.edges.flatMap(edge => { const a = preview.nodes.findIndex(n => n.id === edge.from), b = preview.nodes.findIndex(n => n.id === edge.to); return a >= 0 && b >= 0 ? [`<path d="M${a * 40 + 31} 9H${b * 40 + 1}"/>`] : []; }).join(''), 'Connected steps'));
  }
  return root;
}
