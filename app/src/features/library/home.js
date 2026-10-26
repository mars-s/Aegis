import { createDialog } from '../../lib/ui/dialog.js';
// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { createMenu } from '../../lib/ui/menu.js';
import { boardPreview, escapeHtml as esc } from './preview.js';

export function createHome({ getData, load, open, create, menu, scope, onClose, cover, rename, toast }) {
  const dialog = createDialog({ className: 'library-home', label: 'All projects' });
  document.body.append(dialog);
  const coverMenus = new Set();
  let at = null, generation = 0, returnFocus, coverFor, editing = false;
  const close = () => { closeCoverMenus(); dialog.close(); onClose?.(); returnFocus?.focus(); };
  const path = () => {
    const out = [], seen = new Set(); let id = at;
    while (id && !seen.has(id)) { seen.add(id); const n = getData().nodes.find(n => n.id === id); if (!n) break; out.unshift(n); id = n.parent; }
    return out;
  };
  async function render() {
    if (!dialog.open || editing) return;
    coverMenus.forEach(menu => menu.destroy()); coverMenus.clear();
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
    const nodeTile = n => {
      const tile = `<button class="home-tile" data-into="${esc(n.id)}" data-item="${esc(n.id)}"><div class="home-preview" data-cover="${esc(n.id)}">${n.cover ? `<img src="${esc(n.cover)}" alt="Cover for ${esc(n.name)}">` : n.kind === 'project' ? 'Project' : 'Folder'}</div><strong>${esc(n.name)}</strong><small>${count(n.id)} boards</small></button>`;
      return n.kind === 'project' ? `<div class="home-project">${tile}<button class="home-cover-button" data-project-cover="${esc(n.id)}" aria-label="Cover for ${esc(n.name)}" aria-expanded="false">Cover</button><div class="home-cover-menu" data-cover-menu="${esc(n.id)}" hidden><button data-cover-choice="pick">Choose an image…</button><button data-cover-choice="board">Use the first board</button></div></div>` : tile;
    };
    dialog.innerHTML = `<header><button data-action="back" ${at ? '' : 'disabled'}>Back</button><nav aria-label="Library breadcrumbs"><button data-into="">All projects</button>${chain.map(n => `<span>/</span><button data-into="${esc(n.id)}">${esc(n.name)}</button>`).join('')}</nav><button data-action="close">Back to board</button></header><div class="home-heading"><h1>${esc(here?.name ?? 'All projects')}</h1><div><button data-create="board">+ Board</button>${at ? '<button data-create="folder">+ Folder</button>' : '<button data-create="folder">+ Folder</button><button data-create="project">+ Project</button>'}</div></div><div class="home-tiles">${nodes.sort((a, b) => a.name.localeCompare(b.name)).map(nodeTile).join('')}${boards.map(b => `<button class="home-tile" data-open="${esc(b.id)}" data-item="${esc(b.id)}"><div class="home-preview" data-preview="${esc(b.id)}"></div><strong>${esc(b.name)}</strong><small>${b.cards} cards</small></button>`).join('')}</div><input type="file" accept="image/*" data-cover-file aria-label="Choose a project cover" hidden>${!nodes.length && !boards.length ? '<p class="muted">Nothing here yet. Create a board to get started.</p>' : ''}`;
    for (const trigger of dialog.querySelectorAll('[data-project-cover]')) {
      const menu = trigger.parentElement.querySelector('[data-cover-menu]');
      coverMenus.add(createMenu({ trigger, menu, label: trigger.getAttribute('aria-label'), items: [
        { title: 'Choose an image…', run() { coverFor = trigger.dataset.projectCover; const input = dialog.querySelector('[data-cover-file]'); input.value = ''; input.click(); } },
        { title: 'Use the first board', run() { coverFor = trigger.dataset.projectCover; void cover(coverFor, null); } },
      ] }));
    }
    const previews = [...dialog.querySelectorAll('[data-preview], [data-cover]')];
    await Promise.all(previews.map(async el => {
      if (data.nodes.find(n => n.id === el.dataset.cover)?.cover) return;
      let id = el.dataset.preview;
      if (!id) {
        const inside = b => { let n = b.parent; const seen = new Set(); while (n && !seen.has(n)) { if (n === el.dataset.cover) return true; seen.add(n); n = data.nodes.find(x => x.id === n)?.parent; } return false; };
        id = data.boards.find(b => !b.boardParent && inside(b))?.id;
      }
      if (!id) return;
      try { const b = await load(id); if (version === generation && el.isConnected) el.innerHTML = boardPreview(b); } catch { /* A deleted board has no preview. */ }
    }));
  }
  const closeCoverMenus = () => coverMenus.forEach(menu => menu.close());
  dialog.addEventListener('change', async e => {
    if (!e.target.matches('[data-cover-file]')) return;
    const file = e.target.files[0], id = coverFor; if (!file || !id) return;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const scale = Math.min(1, 720 / image.naturalWidth), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      await cover(id, canvas.toDataURL('image/jpeg', .86));
    } catch (error) { toast(error.message || 'Could not read that image.'); }
    finally { URL.revokeObjectURL(url); }
  });
  dialog.addEventListener('click', async e => {
    if (editing) return;
    const into = e.target.closest('[data-into]'); if (into) { at = into.dataset.into || null; return render(); }
    const board = e.target.closest('[data-open]'); if (board) { close(); return open(board.dataset.open); }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') close();
    if (action === 'back') { at = getData().nodes.find(n => n.id === at)?.parent ?? null; render(); }
    const kind = e.target.closest('[data-create]')?.dataset.create; if (kind) { await create(kind, at); render(); }
  });
  function editName(id) {
    const tile = [...dialog.querySelectorAll('[data-item]')].find(el => el.dataset.item === id), field = tile?.querySelector('strong');
    if (!field || editing) return;
    const before = field.textContent; editing = true; field.contentEditable = 'plaintext-only'; field.focus(); getSelection()?.selectAllChildren(field);
    let done = false;
    const finish = async keep => {
      if (done) return; done = true; field.onblur = null; field.contentEditable = 'false'; editing = false;
      const value = field.textContent.trim();
      if (keep && value && value !== before) await rename(id, value);
      await render();
    };
    field.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); finish(e.key === 'Enter'); } };
    field.onblur = () => finish(true);
  }
  dialog.addEventListener('contextmenu', e => { const item = e.target.closest('[data-item]'); if (item) { e.preventDefault(); menu(e.clientX, e.clientY, item.dataset.item); } });
  addEventListener('keydown', e => { if (dialog.open && !editing && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
  return { show() { returnFocus = document.activeElement; at = null; dialog.showModal(); render(); }, refresh: render, close, rename: editName };
}
