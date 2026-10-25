// Layers panel: every card, top-most first. Click to jump, drag to restack.
const ICON = {
  note: '<path d="M4 2.5h6l2.5 2.5v8.5H4z"/><path d="M10 2.5V5h2.5"/>',
  title: '<path d="M3.5 4V3h9v1M8 3v10M6 13h4"/>',
  todo: '<rect x="3" y="3" width="10" height="10" rx="2"/><path d="m5.5 8 1.8 1.8L10.5 6"/>',
  link: '<path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.8.8M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.8-.8"/>',
  image: '<rect x="2.5" y="3" width="11" height="10" rx="2"/><circle cx="6" cy="6.5" r="1.2"/><path d="m3 12 3.5-3.5 2.5 2.5 1.5-1.5 2.5 2.5"/>',
  video: '<rect x="2.5" y="3.5" width="11" height="9" rx="2"/><path d="m7 6 3 2-3 2z"/>',
  web: '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11"/>',
  agent: '<circle cx="8" cy="6" r="2.5"/><path d="M3.5 13c.8-2.2 2.5-3.3 4.5-3.3s3.7 1.1 4.5 3.3"/>',
};
const LIMIT = 500;
const labelOf = c => (c.heading || c.text?.split('\n').find(Boolean) || (c.url ? c.url.replace(/^asset:.*/, '').replace(/^https?:\/\/(www\.)?/, '') : '') || c.type).slice(0, 80);

export function createLayers({ el, count, getBoard, onPick, onOrder }) {
  const list = el.querySelector('.layer-list');
  let selection = new Set(), lastSig = '', frame = 0;

  function render() {
    frame = 0; const board = getBoard(); if (!board) return;
    const cards = board.cards.slice().reverse().slice(0, LIMIT);
    const sig = JSON.stringify(cards.map(c => [c.id, c.type, labelOf(c), c.badge ?? ''])) + [...selection].join();
    if (sig === lastSig) return; lastSig = sig;
    count.textContent = board.cards.length || '';
    list.textContent = '';
    const frag = document.createDocumentFragment();
    for (const c of cards) {
      const row = document.createElement('div');
      row.className = 'layer-row' + (selection.has(c.id) ? ' on' : ''); row.draggable = true; row.dataset.id = c.id;
      row.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${ICON[c.type] ?? ICON.note}</svg><span class="name"></span>`;
      row.querySelector('.name').textContent = labelOf(c);
      if (c.heading || c.type === 'title') row.classList.add('strong');
      if (c.badge) { const b = document.createElement('span'); b.className = 'mini-badge'; b.textContent = c.badge; row.appendChild(b); }
      frag.appendChild(row);
    }
    if (board.cards.length > LIMIT) { const more = document.createElement('p'); more.className = 'muted small pad'; more.textContent = `${board.cards.length - LIMIT} more not shown`; frag.appendChild(more); }
    if (!board.cards.length) { const p = document.createElement('p'); p.className = 'muted small pad'; p.textContent = 'Nothing on this board yet.'; frag.appendChild(p); }
    list.appendChild(frag);
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };

  list.addEventListener('click', e => { const row = e.target.closest('.layer-row'); if (row) onPick(row.dataset.id, e.shiftKey || e.metaKey); });
  let dragId = null;
  list.addEventListener('dragstart', e => { const row = e.target.closest('.layer-row'); if (!row) return; dragId = row.dataset.id; e.dataTransfer.setData('application/x-aegis-layer', dragId); e.dataTransfer.effectAllowed = 'move'; });
  const clear = () => list.querySelectorAll('.above, .below').forEach(x => x.classList.remove('above', 'below'));
  list.addEventListener('dragover', e => {
    const row = e.target.closest('.layer-row'); if (!dragId || !row || row.dataset.id === dragId) return;
    e.preventDefault(); clear();
    const r = row.getBoundingClientRect(); row.classList.add(e.clientY < r.top + r.height / 2 ? 'above' : 'below');
  });
  list.addEventListener('dragend', () => { dragId = null; clear(); });
  list.addEventListener('drop', e => {
    const row = e.target.closest('.layer-row'); if (!dragId || !row) return; e.preventDefault();
    const above = row.classList.contains('above'); clear();
    // Rows run top-most first, so "above" a row means "in front of" its card.
    const rest = getBoard().cards.filter(c => c.id !== dragId); const j = rest.findIndex(c => c.id === row.dataset.id);
    if (j >= 0) onOrder(dragId, above ? j + 1 : j);
    dragId = null;
  });

  return {
    update: schedule,
    select(ids) { selection = new Set(ids); schedule(); },
  };
}
