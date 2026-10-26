import { cardSummary } from '../../lib/board/summary.js';
import { createDropdown } from '../../lib/ui/dropdown.js';
import { liveReference, referenceCard } from './reference.js';
import { summarisedCard } from '../overview/zoom.js';
import { effectiveFlag } from '../editing/model.js';
import { reduceMotion } from '../../lib/ui/interaction.js';
import '../overview/overview.css';

const GAP = 24;
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
  const sheet = card => card.kind === 'sheet' ? card.id : card.kind === 'plot' ? card.data.source?.cardId : undefined;
  const sourceSheet = sheet(source);
  const relation = card => linked.has(card.id) ? 'Linked' : sourceSheet && sheet(card) === sourceSheet ? 'Shared data' : 'Nearby';
  const rank = { Linked: 0, 'Shared data': 1, Nearby: 2 };
  const origin = centre(source), distance = c => { const p = centre(c); return Math.hypot(p.x - origin.x, p.y - origin.y); };
  return board.cards.filter(c => c.id !== source.id && summarisedCard(c) && !effectiveFlag(board, c, 'hidden'))
    .map(card => ({ card, relation: relation(card) }))
    .sort((a, b) => rank[a.relation] - rank[b.relation] || distance(a.card) - distance(b.card));
}

export function editorContext(canvas, source, editor, apply) {
  const stage = document.getElementById('stage'), boardId = canvas.board.id;
  const layer = document.createElement('div'); layer.className = 'editor-context'; layer.setAttribute('role', 'group'); layer.setAttribute('aria-label', 'Editor context');
  stage.append(layer);
  const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'editor-context-restore'; restore.textContent = 'Show references'; restore.hidden = true;
  stage.append(restore);
  const cardIds = new Set(canvas.board.cards.map(c => c.id));
  let area, frame = 0, destroyed = false, dismissed = false;
  const sourceHeader = document.createElement('button'); sourceHeader.type = 'button';
  sourceHeader.className = 'editor-context-window editor-context-source'; sourceHeader.dataset.cardId = source.id;
  sourceHeader.innerHTML = '<span>Editing</span><strong></strong><span class="editor-context-count"></span>';
  sourceHeader.onclick = () => editor.querySelector('input, [contenteditable], [tabindex="0"]')?.focus({ preventScroll: true });
  const evidence = document.createElement('section'); evidence.className = 'editor-context-window editor-context-reference';
  const tools = document.createElement('div'); tools.className = 'editor-reference-tools';
  const preview = document.createElement('div');
  const empty = document.createElement('p'); empty.className = 'editor-reference-empty'; empty.textContent = 'Link a window to pin it here';
  const open = document.createElement('button'); open.type = 'button'; open.className = 'editor-reference-open'; open.textContent = 'Open reference';
  const nearby = document.createElement('div'); nearby.className = 'editor-context-neighbours'; nearby.setAttribute('aria-label', 'Open a neighbouring editor');
  layer.append(sourceHeader, evidence, nearby);
  const candidates = neighbours(canvas.board, source);
  const references = candidates.filter(entry => referenceCard(entry.card));
  const saved = source.props?.editorReference;
  const initial = references.find(entry => entry.relation !== 'Nearby');
  let chosen = typeof saved?.sourceId === 'string' ? saved.sourceId : saved?.sourceId === null ? '' : initial?.card.id || '';
  const availableReference = () => neighbours(canvas.board, source).find(entry => entry.card.id === chosen && referenceCard(entry.card))?.card;
  function remember(region = {}) {
    if (destroyed || canvas.board.id !== boardId) return;
    const card = canvas.board.cards.find(c => c.id === source.id); if (!card) return;
    const next = { sourceId: chosen || null, row: region.row ?? 1, column: region.column ?? 1 };
    if (JSON.stringify(card.props?.editorReference) !== JSON.stringify(next)) apply([{ op: 'update', id: source.id, set: { props: { editorReference: next } } }]);
  }
  function referenceOptions() {
    const entries = neighbours(canvas.board, source).filter(entry => referenceCard(entry.card));
    return [['', 'None'], ...entries.map(({ card, relation }) => [card.id, `${relation}: ${cardSummary(card).title}`]), ...chosen && !entries.some(entry => entry.card.id === chosen) ? [[chosen, 'Unavailable reference']] : []];
  }
  const switchEditor = id => {
    canvas.select([id]); window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id, keyboard: true } }));
  };
  for (const entry of candidates.slice(0, 2)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'editor-context-open'; button.dataset.cardId = entry.card.id;
    button.textContent = `Open ${cardSummary(entry.card).title}`; button.onclick = () => switchEditor(entry.card.id); nearby.append(button);
  }
  const picker = createDropdown({ label: 'Pinned reference', value: chosen,
    options: referenceOptions(),
    onChange(id) { chosen = id; reference.setRegion({ row: 1, column: 1 }); remember(); refreshContent(); layout(); },
  });
  tools.append(picker); evidence.append(tools, empty, preview, open);
  const reference = liveReference(preview, canvas, { region: saved, onRegionChange: remember });
  open.onclick = () => switchEditor(chosen);
  function dismiss() { dismissed = true; picker.dropdown.close(); layer.hidden = true; schedule(); }
  restore.onclick = () => {
    dismissed = false; area = null;
    cardIds.clear(); canvas.board.cards.forEach(card => cardIds.add(card.id));
    fit(); picker.focus({ preventScroll: true });
  };
  function refreshContent() {
    if (canvas.board.id !== boardId || canvas.board.cards.length !== cardIds.size || canvas.board.cards.some(c => !cardIds.has(c.id))) { dismiss(); return; }
    const card = canvas.board.cards.find(c => c.id === source.id);
    const summary = cardSummary(card);
    sourceHeader.querySelector('strong').textContent = summary.title;
    // Documents show the same shared word count as the editor footer.
    sourceHeader.querySelector('.editor-context-count').textContent = summary.wordCount || '';
    picker.setOptions(referenceOptions()); picker.value = chosen;
    const selected = availableReference();
    empty.textContent = chosen ? 'Reference unavailable. Choose another source or None.' : 'Link a window to pin it here';
    empty.hidden = !!selected; preview.hidden = open.hidden = !selected;
    if (selected) {
      evidence.dataset.cardId = selected.id;
      open.setAttribute('aria-label', `Open reference: ${cardSummary(selected).title}`);
      void reference.update(selected);
    } else { delete evidence.dataset.cardId; reference.clear(); }
  }
  function layout() {
    if (!area) return;
    const selected = availableReference();
    const width = selected?.kind === 'plot' ? 322 : 282;
    evidence.hidden = area.w < width;
    sourceHeader.style.width = `${Math.min(322, area.w)}px`;
    evidence.style.width = `${width}px`;
    if (area.h < 64 + evidence.offsetHeight) evidence.hidden = true;
    nearby.style.top = `${evidence.hidden ? 64 : 64 + evidence.offsetHeight + GAP}px`;
  }
  function fit() {
    frame = 0;
    if (destroyed || canvas.board.id !== boardId) return;
    const next = remainingArea(stage, editor);
    restore.hidden = !dismissed || next.w < 160 || next.h < 32;
    Object.assign(restore.style, { left: `${next.x}px`, top: `${next.y}px` });
    if (dismissed) return;
    if (area && ['x', 'y', 'w', 'h'].every(key => Math.abs(next[key] - area[key]) < .1)) return;
    area = next;
    layer.hidden = area.w < 180 || area.h < 104;
    if (layer.hidden) { picker?.dropdown.close(); return; }
    Object.assign(layer.style, { left: `${area.x}px`, top: `${area.y}px`, width: `${area.w}px`, height: `${area.h}px` });
    layout(); refreshContent();
    const p = centre(source), z = Math.min(1, area.w / source.w, area.h / source.h);
    canvas.glideTo({ x: area.x + area.w / 2 - p.x * z, y: area.y + area.h / 2 - p.y * z, z }, reduceMotion() ? 0 : 380);
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(fit); };
  const sizes = new ResizeObserver(schedule); sizes.observe(editor); sizes.observe(stage);
  const contentSize = new ResizeObserver(layout); contentSize.observe(evidence);
  const chrome = new MutationObserver(schedule); chrome.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const drawerSettled = event => { if (event.target.matches('.tools, .side, .side-editor')) schedule(); };
  document.addEventListener('transitionend', drawerSettled);
  // Manual board work takes over from the composed references, including drag and drop.
  const boardPointer = event => {
    if (stage.contains(event.target) && !restore.contains(event.target) && (!layer.contains(event.target) || event.button !== 0 || stage.classList.contains('pan-ready'))) dismiss();
  };
  document.addEventListener('pointerdown', boardPointer, true);
  stage.addEventListener('wheel', dismiss, { passive: true });
  layer.addEventListener('pointerdown', event => event.stopPropagation());
  stage.addEventListener('boardchange', refreshContent);
  fit();
  return {
    frame: fit,
    destroy() {
      destroyed = true; cancelAnimationFrame(frame); sizes.disconnect(); contentSize.disconnect(); chrome.disconnect();
      document.removeEventListener('transitionend', drawerSettled);
      document.removeEventListener('pointerdown', boardPointer, true); stage.removeEventListener('wheel', dismiss);
      stage.removeEventListener('boardchange', refreshContent);
      picker?.dropdown.destroy(); reference?.destroy();
      layer.remove(); restore.remove();
    },
  };
}
