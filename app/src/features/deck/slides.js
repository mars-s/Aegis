// Shared HTML for the canvas preview, editor stage and filmstrip. No frame-time work.
const SLIDE_WIDTH = 960, SLIDE_HEIGHT = 540;

// ResizeObserver measures local layout sizes, so canvas zoom never changes the fit.
export function observeSlideFits(root) {
  const observer = new ResizeObserver(entries => {
    for (const { target, contentRect: { width, height } } of entries) {
      target.style.setProperty('--slide-scale', String(Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT)));
    }
  });
  root.querySelectorAll('.deck-fit').forEach(frame => observer.observe(frame));
  return () => observer.disconnect();
}

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const slideIndex = (index, length) => Math.max(0, Math.min(length - 1, Number.isFinite(index) ? Math.trunc(index) : 0));
export const newSlide = () => ({ id: crypto.randomUUID(), layout: 'title', title: 'New slide', sub: '', body: '' });
export function deckSlides(card) {
  return (Array.isArray(card.props?.slides) ? card.props.slides : []).filter(s => s && typeof s === 'object').map((s, i) => ({ ...s, id: String(s.id ?? `slide-${i}`) }));
}

export function lineChart(chart = {}) {
  const values = Array.isArray(chart.values) ? chart.values.filter(Number.isFinite) : [];
  const target = Number.isFinite(chart.target) ? chart.target : null;
  if (!values.length) return '<p class="deck-chart-empty">Add chart values to this slide</p>';
  const extent = target === null ? values : [...values, target];
  const min = Math.min(...extent), max = Math.max(...extent), pad = (max - min || Math.abs(max) || 1) * .15;
  const lo = min - pad, hi = max + pad;
  const w = 520, h = 210, left = 32, right = 45, top = 12, bottom = 26;
  const X = i => values.length === 1 ? (w + left - right) / 2 : left + i * (w - left - right) / (values.length - 1);
  const Y = v => top + (hi - v) * (h - top - bottom) / (hi - lo);
  const label = v => Number(v.toPrecision(3)).toString();
  let html = `<svg class="deck-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(chart.label || 'Line chart')}">`;
  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * i / 4, y = Y(v);
    html += `<line class="grid" x1="${left}" x2="${w - right}" y1="${y}" y2="${y}"/><text class="axis" x="${left - 8}" y="${y + 3.5}" text-anchor="end">${label(v)}</text>`;
  }
  const every = Math.max(1, Math.ceil(values.length / 12));
  values.forEach((_, i) => { if (i % every === 0 || i === values.length - 1) html += `<text class="axis" x="${X(i)}" y="${h - 6}" text-anchor="middle">${i + 1}</text>`; });
  if (target !== null) html += `<line class="target" x1="${left}" x2="${w - right}" y1="${Y(target)}" y2="${Y(target)}"/><text class="axis" x="${w - right + 6}" y="${Y(target) + 3.5}">${label(target)}</text>`;
  html += `<polyline class="line" points="${values.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}"/>`;
  values.forEach((v, i) => { html += `<circle class="pt" cx="${X(i)}" cy="${Y(v)}" r="2.4"/>`; });
  return html + '</svg>';
}

// The preview's deterministic ridges, made once and reused for every title slide.
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

function three(body) {
  const labels = String(body ?? '').split('\n').filter(Boolean).slice(0, 3);
  return `<svg viewBox="0 0 200 180" aria-hidden="true" class="deck-three">
    <circle cx="78" cy="72" r="52"/><circle cx="122" cy="72" r="52"/><circle class="hi" cx="100" cy="110" r="52"/>
    <text x="52" y="58">${escapeHTML(labels[0])}</text><text x="148" y="58">${escapeHTML(labels[1])}</text><text x="100" y="150">${escapeHTML(labels[2])}</text></svg>`;
}

export function slideHTML(slide, editable = false, number = 1, resolveUrl = url => globalThis.aegisCtx?.host.assetUrl(url) || url) {
  const layout = ['title', 'chart', 'three', 'text', 'image'].includes(slide.layout) ? slide.layout : 'text';
  const field = (key, label) => `<p class="s-${key}" data-k="${key}"${editable ? ` contenteditable="plaintext-only" spellcheck="true" role="textbox" aria-label="Slide ${number} ${label}" data-placeholder="${label}"` : ''}>${escapeHTML(slide[key])}</p>`;
  // item 14: imported pictures stay as asset references, separate from editable text.
  const images = Array.isArray(slide.images) ? slide.images : [];
  const art = layout === 'title' ? ridges : layout === 'chart' ? lineChart(slide.chart) : layout === 'three' ? three(slide.body) : layout === 'image' ? images.map(image => `<img class="s-picture" src="${escapeHTML(resolveUrl(image.src))}" alt="${escapeHTML(image.alt || slide.title || 'Slide image')}" loading="lazy" decoding="async" draggable="false">`).join('') : '';
  return `<div class="deck-fit"><div class="deck-slide l-${layout}${slide.imageOnly ? ' image-only' : ''}" style="width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px" data-slide="${escapeHTML(slide.id)}"><div class="s-copy">${field('title', 'title')}${field('sub', 'subtitle')}${layout === 'text' || layout === 'image' ? field('body', 'body') : ''}</div>${art ? `<div class="s-art">${art}</div>` : ''}</div></div>`;
  // end item 14
}
