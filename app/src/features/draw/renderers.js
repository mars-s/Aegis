// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { registerRenderer } from '../../canvas/engine.js';
import { svg, inkNode, shapeNode, pathD, colour } from './geometry.js';

function drawingSvg(card) {
  return svg('svg', { class: 'draw-art', viewBox: `0 0 ${card.props?.ow || card.w} ${card.props?.oh || card.h}`, preserveAspectRatio: 'none' });
}
function textInside(el, card, api) {
  const text = document.createElement('div'); text.className = 'draw-text'; text.textContent = card.text;
  text.setAttribute('aria-label', 'Text inside shape'); text.tabIndex = 0;
  const fill = card.props?.fill ?? (card.type === 'shape' ? '#aed3ff' : 'none');
  if (/^#[0-9a-f]{6}$/i.test(fill)) { const rgb = [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16)); text.style.color = (rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114) > 150 ? '#202124' : '#ffffff'; }
  text.addEventListener('dblclick', e => { e.stopPropagation(); text.contentEditable = 'plaintext-only'; text.focus(); });
  text.addEventListener('keydown', e => { if (text.isContentEditable) e.stopPropagation(); if (e.key === 'Escape') text.blur(); });
  text.addEventListener('blur', () => { if (!text.isContentEditable) return; text.contentEditable = 'false'; if (text.textContent !== card.text) api.apply([{ op: 'update', id: card.id, set: { text: text.textContent } }]); });
  el.append(text);
}
function pathArt(card) {
  const p = card.props || {}, art = drawingSvg(card);
  art.append(svg('path', { d: pathD(p.points || [], p.closed, p.radius || 0), fill: p.closed ? colour(p.fill, 'none') : 'none', stroke: colour(p.stroke), 'stroke-width': p.sw || 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', ...(p.dash ? { 'stroke-dasharray': '8 6' } : {}) }));
  return art;
}
const openPoints = card => document.dispatchEvent(new CustomEvent('draw-edit', { detail: card.id }));
registerRenderer('ink', {
  render(el, card) { const p = card.props || {}, art = drawingSvg(card); if (p.points?.length) art.append(inkNode(p.points, p.pen, p.size, p.ink)); el.append(art); },
});
registerRenderer('shape', {
  interactive: '.draw-text[contenteditable="plaintext-only"]',
  render(el, card, api) { const art = card.props?.points ? pathArt(card) : svg('svg', { class: 'draw-art', viewBox: '0 0 100 100', preserveAspectRatio: 'none' }); if (!card.props?.points) art.append(shapeNode(card)); if (card.props?.shape === 'line' && card.props.lineHeight) { art.style.height = card.props.lineHeight + 'px'; art.style.position = 'absolute'; art.style.top = '50%'; art.style.transform = 'translateY(-50%)'; } el.append(art); if (card.props?.shape !== 'line') textInside(el, card, api); },
  open: openPoints,
});
registerRenderer('path', {
  interactive: '.draw-text[contenteditable="plaintext-only"]',
  render(el, card, api) { el.append(pathArt(card)); if (card.text) textInside(el, card, api); },
  open: openPoints,
});
registerRenderer('stamp', {
  render(el, card) { const face = document.createElement('div'); face.className = 'draw-emoji'; if (card.props?.mv) face.dataset.motion = card.props.mv; face.textContent = card.props?.emoji || '⭐'; face.setAttribute('role', 'img'); face.setAttribute('aria-label', card.props?.emoji || 'Star'); el.append(face); },
});
