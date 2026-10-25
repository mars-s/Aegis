// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { registerRenderer } from '../../canvas/engine.js';

const svgNS = 'http://www.w3.org/2000/svg';
const number = (value, fallback, min = 0, max = 4000) => Number.isFinite(+value) ? Math.max(min, Math.min(max, +value)) : fallback;
const ink = (c, p) => p.ink ?? (/^#/.test(c.color) ? c.color : '#27272a');
export function requestImage(card, api) {
  const event = new CustomEvent('aegis:wireframe-image-request', { cancelable: true, detail: { cardId: card.id, label: card.props?.img || 'Image', width: card.w, height: card.h, apply: api.apply } });
  if (document.dispatchEvent(event)) {
    const notice = document.createElement('div'); notice.className = 'wf-image-notice'; notice.role = 'status'; notice.textContent = 'Image generation is not connected. This labelled spot is ready for an agent.'; document.body.append(notice); setTimeout(() => notice.remove(), 4500);
  }
}
function editable(el, card, api, className, text) {
  const body = document.createElement('div'); body.className = className; body.contentEditable = 'plaintext-only'; body.textContent = text; body.spellcheck = false;
  body.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') body.blur(); });
  body.addEventListener('blur', () => {
    const current = api.board.cards.find(c => c.id === card.id);
    if (!current) return;
    const next = body.textContent || '';
    const height = Math.max(24, Math.ceil(body.scrollHeight));
    const set = { text: next, ...(card.type === 'text' ? { h: height, props: { visualH: null } } : {}) };
    if (next !== current.text || (card.type === 'text' && height !== current.h)) api.apply([{ op: 'update', id: card.id, set }]);
  });
  el.append(body); return body;
}
function surface(el, c, p) {
  const svg = document.createElementNS(svgNS, 'svg'); svg.classList.add('wf-surface'); svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
  const rect = document.createElementNS(svgNS, 'rect');
  const sw = p.sdash === 'none' ? 0 : number(p.sw, 0, 0, 100);
  rect.setAttribute('x', String(sw / 2)); rect.setAttribute('y', String(sw / 2));
  rect.setAttribute('width', `calc(100% - ${sw}px)`); rect.setAttribute('height', `calc(100% - ${sw}px)`);
  rect.setAttribute('rx', String(number(p.radius, 0)));
  rect.setAttribute('fill', p.fill === 'none' ? 'none' : p.fill || (c.type === 'frame' ? '#ffffff' : '#e4e4e7'));
  rect.setAttribute('stroke', p.stroke || '#a1a1aa'); rect.setAttribute('stroke-width', String(sw));
  if (p.sdash === 'dash' || p.sdash === true) rect.setAttribute('stroke-dasharray', `${number(p.dl, 8, 1)} ${number(p.dg, 5, 1)}`);
  if (p.sdash === 'dot') { rect.setAttribute('stroke-dasharray', `0 ${number(p.dg, 5, 1) + sw}`); rect.setAttribute('stroke-linecap', 'round'); }
  svg.append(rect); el.append(svg);
}
export function installRenderers() {
  for (const type of ['frame', 'box', 'text', 'icon', 'font', 'section']) registerRenderer(type, {
    render(el, c, api) {
      el.classList.add('wf'); const p = c.props || {};
      el.style.setProperty('--wf-radius', number(p.radius, type === 'section' ? 24 : 0) + 'px');
      if (type === 'frame' || type === 'box') {
        const visual = document.createElement('div'); visual.className = 'wf-visual';
        if (p.visualW != null) visual.style.width = number(p.visualW, c.w) + 'px';
        if (p.visualH != null) visual.style.height = number(p.visualH, c.h) + 'px';
        visual.style.opacity = String(number(p.opacity, 1, 0, 1)); surface(visual, c, p); el.append(visual);
        if (type === 'frame') { const label = editable(el, c, api, 'wf-frame-name body', c.text || 'Screen'); label.setAttribute('aria-label', 'Screen name'); }
        if (p.src) { const img = document.createElement('img'); img.src = api.resolveUrl(p.src); img.alt = p.img || ''; img.draggable = false; visual.append(img); }
        else if (p.img) {
          const label = document.createElement('div'); label.className = 'wf-placeholder'; const icon = document.createElement('span'); icon.className = 'wf-mi'; icon.textContent = 'image';
          const words = document.createElement('span'); words.textContent = p.img;
          const button = document.createElement('button'); button.textContent = 'Fill image'; button.onclick = () => requestImage(c, api); label.append(icon, words, button); visual.append(label);
        }
      } else if (type === 'text') {
        const body = editable(el, c, api, 'body wf-text', c.text);
        Object.assign(body.style, { fontFamily: p.font || 'Arial', fontSize: number(p.size, 18, 1, 600) + 'px', fontWeight: String(number(p.weight, 500, 100, 900)), lineHeight: String(number(p.lh, 1.3, 0.5, 4)), textAlign: ['left', 'center', 'right', 'justify'].includes(p.align) ? p.align : 'left', color: ink(c, p) });
        if (p.hollow) { body.style.webkitTextStroke = `${number(p.sw, 1, 0, 12)}px ${p.stroke || ink(c, p)}`; body.style.color = 'transparent'; }
        // Re-measure on width or typography changes, including after a resize.
        function measure() {
          if (!el.isConnected) return;
          if (el.classList.contains('dragging')) { el._wfMeasure = setTimeout(measure, 60); return; }
          const current = api.board.cards.find(k => k.id === c.id), height = Math.max(24, Math.ceil(body.scrollHeight));
          if (current && !body.contains(document.activeElement) && Math.abs(current.h - height) > 1) api.apply([{ op: 'update', id: c.id, set: { h: height } }]);
        }
        const observer = new ResizeObserver(() => { clearTimeout(el._wfMeasure); measure(); }); observer.observe(body); el._wfObserver = observer;
      } else if (type === 'icon') {
        const icon = document.createElement('span'); icon.className = 'wf-mi wf-icon'; icon.textContent = p.name || 'star';
        icon.style.fontSize = Math.min(p.visualW ?? c.w, p.visualH ?? c.h) + 'px'; icon.style.color = ink(c, p);
        if (p.hollow) { icon.style.webkitTextStroke = `${number(p.sw, 1, 0, 12)}px ${p.stroke || ink(c, p)}`; icon.style.color = 'transparent'; }
        el.append(icon);
      } else if (type === 'font') {
        el.style.fontFamily = p.font || 'Arial';
        const sample = document.createElement('div'); sample.className = 'wf-aa'; sample.textContent = 'Aa';
        const name = document.createElement('strong'); name.textContent = p.font || 'Arial';
        const source = document.createElement('small'); source.textContent = 'Browser / system font';
        el.append(sample, name, source); editable(el, c, api, 'body wf-specimen', c.text || 'The quick brown fox jumps over the lazy dog.');
      } else {
        el.style.setProperty('--wf-glass', p.fill === 'none' ? '#cbd5e1' : p.fill || '#cbd5e1'); if (p.fill === 'none') el.style.background = 'transparent'; editable(el, c, api, 'wf-section-name body', c.text || 'Section');
      }
    },
    drop(el) { el._wfObserver?.disconnect(); clearTimeout(el._wfMeasure); },
    interactive: 'button',
  });
}
