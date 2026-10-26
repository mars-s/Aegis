import { cardSummary } from '../../lib/board/summary.js';
import { summaryContent } from '../overview/summary.js';
import { summarisedCard } from '../overview/zoom.js';
import { effectiveFlag } from '../editing/model.js';
import { reduceMotion } from '../../lib/ui/interaction.js';
import '../overview/overview.css';

const GAP = 24, HEIGHT = 112;
const centre = card => ({ x: card.x + card.w / 2, y: card.y + card.h / 2 });
const layoutBounds = el => {
  const rect = el.getBoundingClientRect();
  // Drawers translate while opening. Use their measured final footprint.
  const transform = new DOMMatrixReadOnly(getComputedStyle(el).transform);
  return { left: rect.left - transform.m41, right: rect.right - transform.m41, top: rect.top - transform.m42, bottom: rect.bottom - transform.m42 };
};

function remainingArea(stage, editor) {
  const rect = stage.getBoundingClientRect(), pane = layoutBounds(editor);
  let left = rect.left;
  const top = rect.top + 44, bottom = rect.bottom - 96;
  for (const el of document.querySelectorAll('.side.open:not(.side-right)')) left = Math.max(left, layoutBounds(el).right);
  for (const el of document.querySelectorAll('.tools:not([hidden])')) left = Math.max(left, el.getBoundingClientRect().right);
  const right = Math.min(rect.right, pane.left);
  return { x: left - rect.left + GAP, y: top - rect.top + GAP, w: right - left - GAP * 2, h: bottom - top - GAP * 2 };
}

function neighbours(board, source) {
  const linked = new Set(board.links.flatMap(link => link.a === source.id ? [link.b] : link.b === source.id ? [link.a] : []));
  const origin = centre(source), distance = c => { const p = centre(c); return Math.hypot(p.x - origin.x, p.y - origin.y); };
  return board.cards.filter(c => c.id !== source.id && summarisedCard(c) && !effectiveFlag(board, c, 'hidden'))
    .sort((a, b) => Number(linked.has(b.id)) - Number(linked.has(a.id)) || distance(a) - distance(b))
    .slice(0, 2).map(card => ({ card, relation: linked.has(card.id) ? 'Linked' : 'Nearby' }));
}

// Fixed screen-size summaries keep both the source and its evidence readable.
// Move a colliding summary the shortest distance, retaining the spatial order.
function placeSummaries(points, area, width) {
  const placed = [], clamp = (n, max) => Math.max(0, Math.min(max, n));
  for (const point of points) {
    const x = clamp(point.x - width / 2, area.w - width), y = clamp(point.y - HEIGHT / 2, area.h - HEIGHT);
    const xs = [x, 0, area.w - width, ...placed.flatMap(p => [p.x - width - 12, p.x + width + 12])];
    const ys = [y, 0, area.h - HEIGHT, ...placed.flatMap(p => [p.y - HEIGHT - 12, p.y + HEIGHT + 12])];
    const choices = xs.flatMap(x => ys.map(y => ({ x, y }))).filter(p => p.x >= 0 && p.y >= 0 && p.x + width <= area.w && p.y + HEIGHT <= area.h
      && placed.every(q => p.x + width + 12 <= q.x || q.x + width + 12 <= p.x || p.y + HEIGHT + 12 <= q.y || q.y + HEIGHT + 12 <= p.y));
    choices.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    if (!choices.length) break;
    placed.push(choices[0]);
  }
  return placed;
}

export function editorContext(canvas, source, editor) {
  const stage = document.getElementById('stage'), boardId = canvas.board.id;
  const layer = document.createElement('div'); layer.className = 'editor-context'; layer.setAttribute('role', 'group'); layer.setAttribute('aria-label', 'Editor context');
  stage.append(layer);
  const cardIds = new Set(canvas.board.cards.map(c => c.id));
  let entries = [], area, frame = 0, destroyed = false, dismissed = false;
  function dismiss() { dismissed = true; layer.hidden = true; }
  function refreshContent() {
    if (canvas.board.cards.length !== cardIds.size || canvas.board.cards.some(c => !cardIds.has(c.id))) {
      dismiss(); return;
    }
    for (const entry of entries) {
      const card = canvas.board.cards.find(c => c.id === entry.card.id);
      if (!card) continue;
      entry.card = card;
      const summary = cardSummary(card);
      // The document being edited shows the same word count as the editor footer.
      if (entry.relation === 'Editing' && summary.wordCount) summary.facts = [summary.facts[0], summary.wordCount].filter(Boolean);
      const content = summaryContent(summary);
      content.querySelector('.semantic-kind').textContent = `${summary.kind} · ${entry.relation}`;
      entry.button.replaceChildren(content);
      entry.button.setAttribute('aria-label', `${entry.relation}: ${summary.title}`);
    }
  }
  function paint() {
    const view = canvas.view;
    for (const entry of entries) {
      const p = centre(entry.card);
      entry.button.style.transform = `translate3d(${p.x * view.z + view.x + entry.dx - area.x}px, ${p.y * view.z + view.y + entry.dy - area.y}px, 0)`;
    }
  }
  function fit() {
    frame = 0;
    if (destroyed || dismissed || canvas.board.id !== boardId) return;
    const next = remainingArea(stage, editor);
    if (area && ['x', 'y', 'w', 'h'].every(key => Math.abs(next[key] - area[key]) < .1)) return;
    area = next;
    if (area.w < 180 || area.h < HEIGHT) { layer.hidden = true; entries = []; return; }
    layer.hidden = false;
    const card = canvas.board.cards.find(c => c.id === source.id);
    if (!card) return;
    const candidates = [{ card, relation: 'Editing' }, ...neighbours(canvas.board, card)];
    candidates.splice(Math.max(1, Math.floor((area.h + 12) / (HEIGHT + 12))));
    const x0 = Math.min(...candidates.map(e => e.card.x)), y0 = Math.min(...candidates.map(e => e.card.y));
    const x1 = Math.max(...candidates.map(e => e.card.x + e.card.w)), y1 = Math.max(...candidates.map(e => e.card.y + e.card.h));
    const z = Math.max(.05, Math.min(1, area.w / Math.max(1, x1 - x0), area.h / Math.max(1, y1 - y0)));
    const target = { x: area.x + area.w / 2 - (x0 + x1) / 2 * z, y: area.y + area.h / 2 - (y0 + y1) / 2 * z, z };
    const width = Math.min(280, area.w);
    const points = candidates.map(({ card }) => { const p = centre(card); return { x: p.x * z + target.x - area.x, y: p.y * z + target.y - area.y }; });
    const positions = placeSummaries(points, area, width);
    entries = candidates.slice(0, positions.length).map((entry, i) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'editor-context-window'; button.dataset.cardId = entry.card.id;
      if (!i) button.classList.add('editor-context-source');
      button.style.width = `${width}px`;
      button.onclick = () => {
        if (!i) editor.querySelector('input, [contenteditable], [tabindex="0"]')?.focus({ preventScroll: true });
        else { canvas.select([entry.card.id]); window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id: entry.card.id, keyboard: true } })); }
      };
      button.onpointerdown = event => event.stopPropagation();
      return { ...entry, button, dx: positions[i].x - points[i].x, dy: positions[i].y - points[i].y };
    });
    layer.replaceChildren(...entries.map(e => e.button));
    Object.assign(layer.style, { left: `${area.x}px`, top: `${area.y}px`, width: `${area.w}px`, height: `${area.h}px` });
    refreshContent(); paint();
    canvas.glideTo(target, reduceMotion() ? 0 : 380);
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(fit); };
  const sizes = new ResizeObserver(schedule); sizes.observe(editor); sizes.observe(stage);
  const chrome = new MutationObserver(schedule); chrome.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const drawerSettled = event => { if (event.target.matches('.tools, .side, .side-editor')) schedule(); };
  document.addEventListener('transitionend', drawerSettled);
  // Manual board work takes over from the composed references, including drag and drop.
  const boardPointer = event => {
    if (stage.contains(event.target) && (!layer.contains(event.target) || event.button !== 0 || stage.classList.contains('pan-ready'))) dismiss();
  };
  document.addEventListener('pointerdown', boardPointer, true);
  stage.addEventListener('wheel', dismiss, { passive: true });
  stage.addEventListener('canvaspaint', paint); stage.addEventListener('boardchange', refreshContent);
  fit();
  return {
    frame: fit,
    destroy() {
      destroyed = true; cancelAnimationFrame(frame); sizes.disconnect(); chrome.disconnect();
      document.removeEventListener('transitionend', drawerSettled);
      document.removeEventListener('pointerdown', boardPointer, true); stage.removeEventListener('wheel', dismiss);
      stage.removeEventListener('canvaspaint', paint); stage.removeEventListener('boardchange', refreshContent);
      layer.remove();
    },
  };
}
