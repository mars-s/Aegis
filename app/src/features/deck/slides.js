import { linePath } from '../../objects/chart/geometry.ts';
import { CHART_POINT, CHART_STROKE, chartScreen } from '../../objects/chart/screen.js';
import { resolveDeckChart } from '../../objects/chart/source.js';
// Shared HTML for the canvas preview, editor stage and filmstrip.
const SLIDE_WIDTH = 960, SLIDE_HEIGHT = 540;

// ResizeObserver measures local layout sizes, so canvas zoom never changes the fit.
export function observeSlideFits(root, options = {}) {
  let closed = false, dropCharts = () => {};
  if (root.querySelector('[data-chart-model]')) void import('../../objects/chart/deck-mount.js').then(({ mountDeckCharts }) => {
    if (!closed) dropCharts = mountDeckCharts(root, options);
  });
  const charts = [...root.querySelectorAll('.deck-chart')].filter(svg => !svg.closest('.deck-thumb, .deck-film-item')).map(svg => chartScreen(svg, {
    labelPixels: () => Math.round(Math.max(12, Math.min(22, svg.closest('.deck-fit').clientHeight / 40))),
  }));
  let frame = 0;
  const observer = new ResizeObserver(entries => {
    for (const { target, contentRect: { width, height } } of entries) {
      target.style.setProperty('--slide-scale', String(Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT)));
    }
    cancelAnimationFrame(frame); frame = requestAnimationFrame(() => charts.forEach(chart => chart.paint()));
  });
  root.querySelectorAll('.deck-fit').forEach(frame => observer.observe(frame));
  return () => { closed = true; dropCharts(); cancelAnimationFrame(frame); observer.disconnect(); charts.forEach(chart => chart.destroy()); };
}

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const slideIndex = (index, length) => Math.max(0, Math.min(length - 1, Number.isFinite(index) ? Math.trunc(index) : 0));
export const newSlide = () => ({ id: crypto.randomUUID(), layout: 'title', background: 'plain', title: 'New slide', sub: '', body: '' });
export function deckSlides(card) {
  return (Array.isArray(card.props?.slides) ? card.props.slides : []).filter(s => s && typeof s === 'object').map((s, i) => ({ ...s, id: String(s.id ?? `slide-${i}`) }));
}

// PM4.4: round the axis outwards without changing the data's unit.
export function chartTicks(values, target = null) {
  const extent = target === null ? values : [...values, target];
  let min = Math.min(...extent), max = Math.max(...extent);
  const integers = values.every(Number.isInteger);
  if (min === max) { const pad = integers ? Math.max(Math.abs(min) * .15, 1) : Math.abs(min) * .15 || .1; min -= pad; max += pad; }
  const rough = (max - min) / 4, power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(n => n * power).find(n => n >= rough && (!integers || Number.isInteger(n))) ?? Math.max(1, Math.ceil(rough));
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => Number((lo + step * i).toPrecision(12)));
  return { lo, hi, ticks };
}

export function lineChart(chart = {}, slideId = '', title = '') {
  if (chart.sourceId || chart.spec) return `<div class="deck-resolved-chart" data-chart-model="${escapeHTML(JSON.stringify({ chart: resolveDeckChart(chart, globalThis.aegisCtx?.canvas.board.cards ?? []), slideId, title }))}"></div>`;
  const points = Array.isArray(chart.values) ? chart.values.flatMap((value, index) => Number.isFinite(value) ? [{ value, label: Array.isArray(chart.labels) ? chart.labels[index] ?? String(index + 1) : String(index + 1) }] : []) : [];
  const values = points.map(point => point.value);
  const target = Number.isFinite(chart.target) ? chart.target : null;
  if (!values.length) return '<p class="deck-chart-empty">Add chart values to this slide</p>';
  const { lo, hi, ticks } = chartTicks(values, target);
  const unit = String(chart.unit || '');
  const w = 520, h = 210, left = 42, right = 45, top = unit ? 24 : 12, bottom = 26;
  const X = i => values.length === 1 ? (w + left - right) / 2 : left + i * (w - left - right) / (values.length - 1);
  const Y = v => top + (hi - v) * (h - top - bottom) / (hi - lo);
  const label = v => Number(v.toPrecision(12)).toString();
  let html = `<svg class="deck-chart" viewBox="0 0 ${w} ${h}" font-family="Inter Variable, sans-serif" font-size="12" font-weight="400" text-rendering="geometricPrecision" role="img" aria-label="${escapeHTML(chart.label || 'Line chart')}">`;
  if (unit) html += `<text class="axis axis-unit" x="${left}" y="12">${escapeHTML(unit)}</text>`;
  for (const v of ticks) {
    const y = Y(v);
    html += `<line class="grid" x1="${left}" x2="${w - right}" y1="${y}" y2="${y}"/><text class="axis y-tick" x="${left - 8}" y="${y + 3.5}" text-anchor="end">${label(v)}</text>`;
  }
  const every = Math.max(1, Math.ceil(values.length / 12));
  values.forEach((_, i) => { if (i % every === 0 || i === values.length - 1) html += `<text class="axis x-tick" x="${X(i)}" y="${h - 6}" text-anchor="middle">${escapeHTML(points[i].label)}</text>`; });
  if (target !== null) html += `<line class="target" x1="${left}" x2="${w - right}" y1="${Y(target)}" y2="${Y(target)}"/><text class="axis" x="${w - right + 6}" y="${Y(target) + 3.5}">${label(target)}</text>`;
  html += `<path class="line" stroke-width="${CHART_STROKE}" d="${linePath(values.map((v, i) => ({ x: X(i), y: Y(v) })), chart.smooth === true)}"/>`;
  values.forEach((v, i) => { html += `<circle class="pt" cx="${X(i)}" cy="${Y(v)}" r="${CHART_POINT}"/>`; });
  return html + '</svg>';
}

// The optional Sci-fi wave background. Saved title slides used it implicitly.
const ridges = (() => {
  let seed = 7;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let html = '<svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">';
  for (let k = 0; k < 9; k++) {
    const base = 40 + k * 9, amp = 30 - k * 2.2, phase = random() * 6, phase2 = random() * 6;
    let path = '';
    for (let x = 0; x <= 400; x += 8) {
      const y = base - amp * Math.exp(-((x - 250) ** 2) / 9000) - 10 * Math.sin(x / 47 + phase) * Math.sin(x / 23 + phase2) * (1 - k / 12);
      path += `${x ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
    }
    html += `<path class="deck-ridge${k === 2 ? ' hi' : ''}" d="${path}"/>`;
  }
  return html + '</svg>';
})();

function three(body, relationship, editable, number) {
  const labels = String(body ?? '').split('\n').slice(0, 3);
  if (relationship !== 'overlap') return `<div class="deck-ideas">${Array.from({ length: 3 }, (_, i) => `<p class="deck-idea" data-k="body" data-idea="${i}"${editable ? ` contenteditable="plaintext-only" spellcheck="true" role="textbox" aria-label="Slide ${number} idea ${i + 1}" data-placeholder="Idea ${i + 1}"` : ''}>${escapeHTML(labels[i])}</p>`).join('')}</div>`;
  return `<svg viewBox="0 0 200 180" role="img" aria-label="Overlapping ideas" class="deck-three" font-family="Inter Variable, sans-serif" font-size="10" font-weight="400" text-rendering="geometricPrecision">
    <circle cx="78" cy="72" r="52"/><circle cx="122" cy="72" r="52"/><circle class="hi" cx="100" cy="110" r="52"/>
    <text x="52" y="58">${escapeHTML(labels[0])}</text><text x="148" y="58">${escapeHTML(labels[1])}</text><text x="100" y="150">${escapeHTML(labels[2])}</text></svg>`;
}

export function slideHTML(slide, editable = false, number = 1, resolveUrl = url => globalThis.aegisCtx?.host.assetUrl(url) || url) {
  const layout = ['title', 'chart', 'three', 'text', 'image'].includes(slide.layout) ? slide.layout : 'text';
  const field = (key, label) => `<p class="s-${key}" data-k="${key}"${editable ? ` contenteditable="plaintext-only" spellcheck="true" role="textbox" aria-label="Slide ${number} ${label}" data-placeholder="${label}"` : ''}>${escapeHTML(slide[key])}</p>`;
  // item 14: imported pictures stay as asset references, separate from editable text.
  const images = Array.isArray(slide.images) ? slide.images : [];
  const wave = layout === 'title' && (slide.background === 'sci-fi-wave' || slide.background == null);
  const art = layout === 'title' ? (wave ? ridges : '') : layout === 'chart' ? lineChart(slide.chart, slide.id, slide.title) : layout === 'three' ? three(slide.body, slide.relationship, editable, number) : layout === 'image' ? images.map(image => `<img class="s-picture" src="${escapeHTML(resolveUrl(image.src))}" alt="${escapeHTML(image.alt || slide.title || 'Slide image')}" loading="lazy" decoding="async" draggable="false">`).join('') : '';
  return `<div class="deck-fit"><div class="deck-slide l-${layout}${layout === 'title' && !wave ? ' bg-plain' : ''}${layout === 'three' && slide.relationship === 'overlap' ? ' has-overlap' : ''}${slide.imageOnly ? ' image-only' : ''}" style="width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px" data-slide="${escapeHTML(slide.id)}"><div class="s-copy">${field('title', 'title')}${field('sub', 'subtitle')}${layout === 'text' || layout === 'image' ? field('body', 'body') : ''}</div>${art ? `<div class="s-art">${art}</div>` : ''}</div></div>`;
  // end item 14
}
