// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { createMenu } from './menu.js';
import { rowMenuButton } from '../lib/ui/menu.js';
import { collectionLayout } from '../features/editing/model.js';
import { layerParents, layerDescendants } from '../features/editing/layer-model.js';
// Windows panel: every card, top-most first. Click to jump, drag to restack.
const ICON = {
  note: '<path d="M4 2.5h6l2.5 2.5v8.5H4z"/><path d="M10 2.5V5h2.5"/>',
  title: '<path d="M3.5 4V3h9v1M8 3v10M6 13h4"/>',
  todo: '<rect x="3" y="3" width="10" height="10" rx="2"/><path d="m5.5 8 1.8 1.8L10.5 6"/>',
  link: '<path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.8.8M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.8-.8"/>',
  image: '<rect x="2.5" y="3" width="11" height="10" rx="2"/><circle cx="6" cy="6.5" r="1.2"/><path d="m3 12 3.5-3.5 2.5 2.5 1.5-1.5 2.5 2.5"/>',
  video: '<rect x="2.5" y="3.5" width="11" height="9" rx="2"/><path d="m7 6 3 2-3 2z"/>',
  web: '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11"/>',
  agent: '<circle cx="8" cy="6" r="2.5"/><path d="M3.5 13c.8-2.2 2.5-3.3 4.5-3.3s3.7 1.1 4.5 3.3"/>',
  plot: '<path d="M3 13V8M6.5 13V4M10 13V9M13.5 13V6"/>',
  sheet: '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M2.5 9.8h11M6.5 3v10"/>',
  diagram: '<rect x="2" y="3" width="4.5" height="3.5" rx="1"/><rect x="9.5" y="9.5" width="4.5" height="3.5" rx="1"/><path d="M4.2 6.5v2.5a1.5 1.5 0 0 0 1.5 1.5h3.8"/>',
  reply: '<path d="M3 4h10M3 7.5h7M3 11h8"/>',
  plan: '<circle cx="4" cy="4" r="1.3"/><circle cx="4" cy="8" r="1.3"/><circle cx="4" cy="12" r="1.3"/><path d="M7 4h6M7 8h6M7 12h6"/>',
  list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5"/>',
  code: '<path d="m5.5 5-3 3 3 3M10.5 5l3 3-3 3"/>',
};
const LIMIT = 500;
const KIND = { reply: 'Answer', plot: 'Chart', sheet: 'Sheet', diagram: 'Diagram', plan: 'Plan', list: 'List', code: 'Code' };
const labelOf = c => c.props?.layerName ?? (c.type === 'object' ? (c.kind === 'reply' ? c.data?.headline : c.text) || KIND[c.kind] || 'Object' : null) ?? (c.heading || c.text?.split('\n').find(Boolean) || (c.url ? c.url.replace(/^asset:.*/, '').replace(/^https?:\/\/(www\.)?/, '') : '') || c.type);

export function createLayers({ el, count, getBoard, onPick, onOrder, onUpdate }) {
  const list = el.querySelector('.layer-list'), menu = createMenu();
  let selection = new Set(), lastSig = '', frame = 0;
  const folded = new Set();
  let lastBoard;

  function render() {
    frame = 0; const board = getBoard(); if (!board) return;
    if (lastBoard !== board.id) { folded.clear(); lastBoard = board.id; }
    const cards = board.cards.slice().reverse().slice(0, LIMIT);
    const parents = layerParents(board);
    const byParent = new Map();
    for (const c of cards) { const parent = parents.get(c.id); if (!byParent.has(parent)) byParent.set(parent, []); byParent.get(parent).push(c); }
    const sig = JSON.stringify(cards.map(c => [c.id, c.type, c.kind, labelOf(c), c.badge ?? '', parents.get(c.id), c.group, c.props])) + [...selection].join() + [...folded].join();
    if (sig === lastSig) return; lastSig = sig;
    count.textContent = board.cards.length || '';
    const focused = list.contains(document.activeElement) ? document.activeElement.closest('.layer-row')?.dataset.id : null;
    menu.close(); list.textContent = '';
    const frag = document.createDocumentFragment();
    const seen = new Set(), groups = new Set();
    const parentOf = c => parents.get(c.id);
    function append(c, depth = 0) {
      if (seen.has(c.id)) return; seen.add(c.id);
      const children = c.type === 'coll' ? (c.props?.kids ?? []).map(id => (byParent.get(c.id) ?? []).find(k => k.id === id)).filter(Boolean) : byParent.get(c.id) ?? [];
      const row = document.createElement('div');
      row.className = 'layer-row' + (selection.has(c.id) ? ' on' : '') + (c.props?.hidden ? ' is-hidden' : ''); row.draggable = true; row.dataset.id = c.id; row.dataset.parent = parentOf(c) ?? ''; row.dataset.depth = String(depth); row.style.setProperty('--d', String(depth)); row.tabIndex = 0;
      row.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${ICON[c.type === 'object' ? c.kind : c.type] ?? ICON.note}</svg><span class="name"></span>`;
      row.querySelector('.name').textContent = labelOf(c); row.querySelector('.name').title = labelOf(c);
      if (c.heading || c.type === 'title' || c.kind === 'reply') row.classList.add('strong');
      if (children.length) {
        const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'layer-fold';
        toggle.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${folded.has(c.id) ? 'm6 4 4 4-4 4' : 'm4 6 4 4 4-4'}"/></svg>`;
        toggle.setAttribute('aria-label', `${folded.has(c.id) ? 'Expand' : 'Collapse'} ${labelOf(c)}`); toggle.setAttribute('aria-expanded', String(!folded.has(c.id)));
        toggle.onclick = e => { e.stopPropagation(); folded.has(c.id) ? folded.delete(c.id) : folded.add(c.id); schedule(); };
        row.querySelector('svg').replaceWith(toggle);
      }
      const state = document.createElement('span'); state.className = 'row-state';
      for (const [flag, title, path] of [
        ['hidden', 'Hidden', '<path d="m2 2 12 12M6 3.5A7 7 0 0 1 14 8a10 10 0 0 1-2 2.5M9.5 12.5A7 7 0 0 1 2 8a10 10 0 0 1 2-2.5"/>'],
        ['locked', 'Locked', '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>'],
      ]) if (c.props?.[flag]) state.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 16 16" role="img" aria-label="${title}"><title>${title}</title>${path}</svg>`);
      row.append(state);
      const rename = () => {
        const name = row.querySelector('.name'), input = document.createElement('input'); input.value = labelOf(c); input.setAttribute('aria-label', 'Window name'); name.replaceWith(input); input.focus(); input.select(); let cancelled = false;
        input.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); cancelled = ev.key === 'Escape'; input.blur(); } };
        input.onblur = () => { if (!cancelled && input.value.trim()) onUpdate?.([{ op: 'update', id: c.id, set: { props: { layerName: input.value.trim() }, ...(c.type === 'coll' ? { text: input.value.trim() } : {}) } }]); lastSig = ''; schedule(); };
      };
      row.querySelector('.name').ondblclick = e => { e.stopPropagation(); rename(); };
      const more = rowMenuButton(labelOf(c)); row.append(more);
      const show = event => {
        event.preventDefault(); event.stopPropagation(); const r = more.getBoundingClientRect();
        const toggle = flag => onUpdate?.(layerDescendants(board, [c.id], parents).map(k => ({ op: 'update', id: k.id, set: { props: { [flag]: !c.props?.[flag] } } })));
        menu.show(r.left, r.bottom + 6, [
          { title: c.props?.hidden ? 'Show' : 'Hide', run: () => toggle('hidden') },
          { title: c.props?.locked ? 'Unlock' : 'Lock', run: () => toggle('locked') },
          { title: 'Rename', run: rename },
          { title: 'Delete', section: 'zz', run: () => document.getElementById('stage').dispatchEvent(new CustomEvent('layerdelete', { detail: { ids: [c.id] } })) },
        ], event, more);
      };
      more.onclick = show;
      more.onkeydown = event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) show(event); };
      row.onkeydown = event => { if (event.target === row && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onPick(c.id, event.shiftKey || event.metaKey || event.ctrlKey); } };
      row.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); if (!selection.has(c.id)) onPick(c.id, false); document.getElementById('stage').dispatchEvent(new CustomEvent('layercontext', { detail: { x: e.clientX, y: e.clientY, ids: selection.has(c.id) ? [...selection] : [c.id] } })); };
      row.onmouseenter = () => document.querySelector(`#world [data-id="${c.id}"]`)?.classList.add('layer-hover');
      row.onmouseleave = () => document.querySelector(`#world [data-id="${c.id}"]`)?.classList.remove('layer-hover');
      frag.appendChild(row);
      if (!folded.has(c.id)) children.forEach(child => append(child, depth + 1));
    }
    for (const c of cards.filter(c => !parentOf(c) || !cards.some(p => p.id === parentOf(c)))) {
      if (c.group) {
        if (groups.has(c.group)) continue; groups.add(c.group);
        const members = cards.filter(k => k.group === c.group && !parentOf(k));
        const header = document.createElement('div'); header.className = 'layer-group'; header.textContent = `${folded.has(c.group) ? '▸' : '▾'} ${c.props?.groupName || 'Group'} (${members.length})`;
        header.onclick = () => { folded.has(c.group) ? folded.delete(c.group) : folded.add(c.group); schedule(); };
        header.ondblclick = () => { const input = document.createElement('input'); input.value = c.props?.groupName || 'Group'; input.setAttribute('aria-label', 'Group name'); header.replaceChildren(input); input.focus(); input.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); }; input.onblur = () => onUpdate?.(members.map(m => ({ op: 'update', id: m.id, set: { props: { groupName: input.value.trim() || 'Group' } } }))); };
        frag.append(header); if (!folded.has(c.group)) members.forEach(member => append(member, 1));
      } else append(c);
    }
    if (board.cards.length > LIMIT) { const more = document.createElement('p'); more.className = 'muted small pad'; more.textContent = `${board.cards.length - LIMIT} more not shown`; frag.appendChild(more); }
    if (!board.cards.length) { const p = document.createElement('p'); p.className = 'muted small pad'; p.textContent = 'Nothing on this board yet.'; frag.appendChild(p); }
    list.appendChild(frag);
    if (focused) [...list.querySelectorAll('.layer-row')].find(row => row.dataset.id === focused)?.querySelector('.row-more')?.focus({ preventScroll: true });
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };

  list.addEventListener('click', e => { const row = e.target.closest('.layer-row'); if (row && !e.target.closest('button, input')) onPick(row.dataset.id, e.shiftKey || e.metaKey || e.ctrlKey); });
  let dragId = null;
  list.addEventListener('dragstart', e => { const row = e.target.closest('.layer-row'); if (!row) return; dragId = row.dataset.id; e.dataTransfer.setData('application/x-aegis-layer', dragId); e.dataTransfer.effectAllowed = 'move'; });
  const clear = () => list.querySelectorAll('.above, .below').forEach(x => x.classList.remove('above', 'below'));
  list.addEventListener('dragover', e => {
    const row = e.target.closest('.layer-row'); if (!dragId || !row || row.dataset.id === dragId || list.querySelector(`.layer-row[data-id="${dragId}"]`)?.dataset.parent !== row.dataset.parent) return;
    e.preventDefault(); clear();
    const r = row.getBoundingClientRect(); row.classList.add(e.clientY < r.top + r.height / 2 ? 'above' : 'below');
  });
  list.addEventListener('dragend', () => { dragId = null; clear(); });
  list.addEventListener('drop', e => {
    const row = e.target.closest('.layer-row'); if (!dragId || !row) return; e.preventDefault();
    if (!row.matches('.above,.below') || row.dataset.id === dragId) { dragId = null; clear(); return; }
    const board = getBoard(), source = board.cards.find(c => c.id === dragId), target = board.cards.find(c => c.id === row.dataset.id);
    const parents = layerParents(board), parent = board.cards.find(c => c.id === parents.get(source?.id));
    if (!source || !target || parents.get(source.id) !== parents.get(target.id) || (parent?.type !== 'coll' && source.group !== target.group)) { dragId = null; clear(); return; }
    const above = row.classList.contains('above'); clear();
    if (parent?.type === 'coll') { const kids = parent.props.kids.filter(id => id !== dragId); kids.splice(kids.indexOf(target.id) + (above ? 0 : 1), 0, dragId); onUpdate?.(collectionLayout(board, parent, kids)); dragId = null; return; }
    // Rows run top-most first, so "above" a row means "in front of" its card.
    const moving = layerDescendants(board, [dragId], parents).map(c => c.id), targets = new Set(layerDescendants(board, [target.id], parents).map(c => c.id));
    const rest = board.cards.filter(c => !moving.includes(c.id)), indices = rest.flatMap((c, i) => targets.has(c.id) ? [i] : []);
    if (indices.length) onUpdate?.([{ op: 'order', ids: moving, to: above ? Math.max(...indices) + 1 : Math.min(...indices) }]);
    dragId = null;
  });

  document.getElementById('stage').addEventListener('boardchange', e => {
    if (!e.detail.first) return;
    // Outgoing rows must disappear before card cleanup checks for remaining mounted content.
    list.replaceChildren(); count.textContent = e.detail.board.cards.length || ''; lastSig = ''; schedule();
  });
  return {
    update: schedule,
    select(ids) { selection = new Set(ids); const board = getBoard(); if (board) { const parents = layerParents(board), byId = new Map(board.cards.map(c => [c.id, c])); for (const card of board.cards.filter(c => selection.has(c.id))) { let c = card; const seen = new Set(); while (c && !seen.has(c.id)) { seen.add(c.id); folded.delete(c.group); const parent = parents.get(c.id); folded.delete(parent); c = byId.get(parent); } } } schedule(); },
  };
}
