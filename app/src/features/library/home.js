// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { boardPreview, escapeHtml as esc } from './preview.js';

export function createHome({ getData, load, open, create, menu, scope }) {
  const dialog = document.createElement('dialog'); dialog.className = 'library-home'; dialog.setAttribute('aria-label', 'All projects');
  document.body.append(dialog);
  let at = null, generation = 0, returnFocus;
  const close = () => { dialog.close(); returnFocus?.focus(); };
  const path = () => {
    const out = [], seen = new Set(); let id = at;
    while (id && !seen.has(id)) { seen.add(id); const n = getData().nodes.find(n => n.id === id); if (!n) break; out.unshift(n); id = n.parent; }
    return out;
  };
  async function render() {
    if (!dialog.open) return;
    const version = ++generation, data = getData();
    if (at && !data.nodes.some(n => n.id === at)) at = null;
    scope(at);
    const chain = path(), here = chain.at(-1);
    const nodes = data.nodes.filter(n => n.parent === at);
    const boards = data.boards.filter(b => b.parent === at && !b.boardParent);
    const count = id => {
      const ids = new Set([id]); let previous;
      do { previous = ids.size; data.nodes.forEach(n => { if (ids.has(n.parent)) ids.add(n.id); }); } while (ids.size !== previous);
      return data.boards.filter(b => ids.has(b.parent)).length;
    };
    dialog.innerHTML = `<header><button data-action="back" ${at ? '' : 'disabled'}>Back</button><nav aria-label="Library breadcrumbs"><button data-into="">All projects</button>${chain.map(n => `<span>/</span><button data-into="${esc(n.id)}">${esc(n.name)}</button>`).join('')}</nav><button data-action="close">Back to board</button></header><div class="home-heading"><h1>${esc(here?.name ?? 'All projects')}</h1><div><button data-create="board">+ Board</button>${at ? '<button data-create="folder">+ Folder</button>' : '<button data-create="folder">+ Folder</button><button data-create="project">+ Project</button>'}</div></div><div class="home-tiles">${nodes.sort((a, b) => a.name.localeCompare(b.name)).map(n => `<button class="home-tile" data-into="${esc(n.id)}" data-item="${esc(n.id)}"><div class="home-preview" data-cover="${esc(n.id)}">${n.kind === 'project' ? 'Project' : 'Folder'}</div><strong>${esc(n.name)}</strong><small>${count(n.id)} boards</small></button>`).join('')}${boards.map(b => `<button class="home-tile" data-open="${esc(b.id)}" data-item="${esc(b.id)}"><div class="home-preview" data-preview="${esc(b.id)}"></div><strong>${esc(b.name)}</strong><small>${b.cards} cards</small></button>`).join('')}</div>${!nodes.length && !boards.length ? '<p class="muted">Nothing here yet. Create a board to get started.</p>' : ''}`;
    const previews = [...dialog.querySelectorAll('[data-preview], [data-cover]')];
    await Promise.all(previews.map(async el => {
      let id = el.dataset.preview;
      if (!id) {
        const inside = b => { let n = b.parent; const seen = new Set(); while (n && !seen.has(n)) { if (n === el.dataset.cover) return true; seen.add(n); n = data.nodes.find(x => x.id === n)?.parent; } return false; };
        id = data.boards.find(b => !b.boardParent && inside(b))?.id;
      }
      if (!id) return;
      try { const b = await load(id); if (version === generation && el.isConnected) el.innerHTML = boardPreview(b); } catch { /* A deleted board has no preview. */ }
    }));
  }
  dialog.addEventListener('click', async e => {
    const into = e.target.closest('[data-into]'); if (into) { at = into.dataset.into || null; return render(); }
    const board = e.target.closest('[data-open]'); if (board) { close(); return open(board.dataset.open); }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') close();
    if (action === 'back') { at = getData().nodes.find(n => n.id === at)?.parent ?? null; render(); }
    const kind = e.target.closest('[data-create]')?.dataset.create; if (kind) { await create(kind, at); render(); }
  });
  dialog.addEventListener('contextmenu', e => { const item = e.target.closest('[data-item]'); if (item) { e.preventDefault(); menu(e.clientX, e.clientY, item.dataset.item); } });
  addEventListener('keydown', e => { if (dialog.open && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
  return { show() { returnFocus = document.activeElement; at = null; dialog.showModal(); render(); }, refresh: render, close };
}
