import { createDialog } from '../../lib/ui/dialog.js';
// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { createMenu } from '../../lib/ui/menu.js';
import { boardPreview, escapeHtml as esc } from './preview.js';

export function createHome({ getData, load, open, create, menu, scope, onClose, cover, rename, toast }) {
  const dialog = createDialog({ className: 'library-home', label: 'All projects' });
  document.body.append(dialog);
  const coverMenus = new Set(), cache = new Map(), pending = new Map();
  let at = null, generation = 0, returnFocus, coverFor, editing = false, query = '', observer, newMenu;
  let activeLoads = 0, jobs = [];
  const closeCoverMenus = () => { coverMenus.forEach(menu => menu.close()); newMenu?.close(); };
  const close = () => { ++generation; observer?.disconnect(); jobs = []; closeCoverMenus(); dialog.close(); onClose?.(); returnFocus?.focus(); };
  const path = () => {
    const out = [], seen = new Set(); let id = at;
    const nodes = new Map(getData().nodes.map(n => [n.id, n]));
    while (id && !seen.has(id)) { seen.add(id); const n = nodes.get(id); if (!n) break; out.unshift(n); id = n.parent; }
    return out;
  };
  function drain() {
    while (activeLoads < 4 && jobs.length) {
      const job = jobs.shift();
      if (job.version !== generation || !job.el.isConnected) continue;
      activeLoads++;
      Promise.resolve().then(job.run).finally(() => { activeLoads--; drain(); });
    }
  }
  function preview(el, board, version) {
    const key = `${board.id}:${board.rev}`;
    const paint = markup => { if (version === generation && el.isConnected) el.innerHTML = markup; };
    if (cache.has(key)) return paint(cache.get(key));
    jobs.push({ el, version, async run() {
      try {
        if (!pending.has(key)) pending.set(key, load(board.id).then(boardPreview));
        const markup = await pending.get(key); cache.set(key, markup); pending.delete(key);
        while (cache.size > 220) cache.delete(cache.keys().next().value);
        paint(markup);
      } catch { pending.delete(key); paint('<span class="muted">Preview unavailable</span>'); }
    } });
    drain();
  }
  function edited(board) {
    const date = new Date(board.editedAt);
    if (!board.editedAt || !Number.isFinite(date.getTime())) return '<span>Edit time unavailable</span>';
    const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
    const label = days === 0 ? 'Edited today' : days === 1 ? 'Edited yesterday' : days < 7 ? `Edited ${days} days ago` : `Edited ${date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
    return `<time datetime="${date.toISOString()}" title="${esc(date.toLocaleString('en-AU'))}">${label}</time>`;
  }
  function render() {
    if (!dialog.open || editing) return;
    const focusedSearch = dialog.querySelector('[data-home-search]') === document.activeElement;
    observer?.disconnect(); jobs = []; coverMenus.forEach(menu => menu.destroy()); coverMenus.clear(); newMenu?.destroy();
    const version = ++generation, data = getData();
    if (at && !data.nodes.some(n => n.id === at)) at = null;
    scope(at);
    const chain = path(), here = chain.at(-1), nodesById = new Map(data.nodes.map(n => [n.id, n]));
    const within = parent => {
      if (!at) return true;
      const seen = new Set();
      while (parent && !seen.has(parent)) { if (parent === at) return true; seen.add(parent); parent = nodesById.get(parent)?.parent; }
      return false;
    };
    const counts = new Map();
    for (const board of data.boards) {
      let parent = board.parent; const seen = new Set();
      while (parent && !seen.has(parent)) { seen.add(parent); counts.set(parent, (counts.get(parent) || 0) + 1); parent = nodesById.get(parent)?.parent; }
    }
    dialog.innerHTML = `<header><button data-action="back" ${at ? '' : 'disabled'}>Back</button><nav aria-label="Library breadcrumbs"><button data-into="">All projects</button>${chain.map(n => `<span>/</span><button data-into="${esc(n.id)}">${esc(n.name)}</button>`).join('')}</nav><button data-action="close">Back to board</button></header><div class="home-heading"><h1>${esc(here?.name ?? 'All projects')}</h1><div class="home-new"><button data-home-new aria-label="New" aria-haspopup="menu">New <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 6 3.5 3.5L11.5 6"/></svg></button></div></div><div class="home-search-row"><input type="search" data-home-search aria-label="Search library" placeholder="Find a board, a thought, a project…" autocomplete="off"><span data-home-count role="status"></span></div><div class="home-tiles"></div><p class="home-empty" hidden></p><input type="file" accept="image/*" data-cover-file aria-label="Choose a project cover" hidden>`;
    const search = dialog.querySelector('[data-home-search]'); search.value = query;
    newMenu = createMenu({ trigger: dialog.querySelector('[data-home-new]'), portal: false, label: 'New in library', items: ['board', 'folder', 'project'].map(kind => ({ title: kind[0].toUpperCase() + kind.slice(1), async run() { const result = await create(kind, kind === 'project' ? null : at); if (!result) return; if (kind === 'board') close(); else { query = ''; if (kind === 'project') at = null; render(); editName(result.created); } } })) });
    function tiles() {
      observer?.disconnect(); jobs = []; coverMenus.forEach(menu => menu.destroy()); coverMenus.clear();
      const needle = query.trim().toLocaleLowerCase();
      const nodes = data.nodes.filter(n => (needle ? within(n.parent) : n.parent === at) && (!needle || n.name.toLocaleLowerCase().includes(needle))).sort((a, b) => a.name.localeCompare(b.name));
      const boards = data.boards.filter(b => (needle ? within(b.parent) : b.parent === at && !b.boardParent) && (!needle || `${b.name} ${b.subtitle || ''}`.toLocaleLowerCase().includes(needle))).sort((a, b) => (b.editedAt || 0) - (a.editedAt || 0));
      const nodeTile = n => {
        const count = counts.get(n.id) || 0;
        const tile = `<button class="home-tile" data-into="${esc(n.id)}" data-item="${esc(n.id)}"><div class="home-preview" data-cover="${esc(n.id)}">${n.cover ? `<img src="${esc(n.cover)}" alt="Cover for ${esc(n.name)}">` : `<span class="home-container-kind">${n.kind === 'project' ? 'Project' : 'Folder'}</span>`}</div><strong>${esc(n.name)}</strong><span class="home-subtitle">${n.kind === 'project' ? 'Project' : 'Folder'}</span><small>${count} ${count === 1 ? 'board' : 'boards'}</small></button>`;
        return n.kind === 'project' ? `<div class="home-project">${tile}<button class="home-cover-button" data-project-cover="${esc(n.id)}" aria-label="Cover for ${esc(n.name)}" aria-expanded="false">Cover</button><div class="home-cover-menu" data-cover-menu="${esc(n.id)}" hidden></div></div>` : tile;
      };
      dialog.querySelector('.home-tiles').innerHTML = nodes.map(nodeTile).join('') + boards.map(b => `<button class="home-tile" data-open="${esc(b.id)}" data-item="${esc(b.id)}"><div class="home-preview" data-preview="${esc(b.id)}"><span class="home-container-kind">${b.cards} ${b.cards === 1 ? 'window' : 'windows'}</span></div><strong>${esc(b.name)}</strong><span class="home-subtitle">${esc(b.subtitle || 'An empty board, ready for an idea.')}</span><small><span>${b.cards} ${b.cards === 1 ? 'window' : 'windows'}</span>${edited(b)}</small></button>`).join('');
      const count = nodes.length + boards.length, empty = dialog.querySelector('.home-empty');
      dialog.querySelector('[data-home-count]').textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
      empty.hidden = count > 0; empty.textContent = needle ? 'No matches. Try a board title or a word from your work.' : 'A place for your next project. Create a board to begin.';
      for (const trigger of dialog.querySelectorAll('[data-project-cover]')) {
        const menu = trigger.parentElement.querySelector('[data-cover-menu]');
        coverMenus.add(createMenu({ trigger, menu, label: trigger.getAttribute('aria-label'), items: [
          { title: 'Choose an image…', run() { coverFor = trigger.dataset.projectCover; const input = dialog.querySelector('[data-cover-file]'); input.value = ''; input.click(); } },
          { title: 'Use the first board', run() { coverFor = trigger.dataset.projectCover; void cover(coverFor, null); } },
        ] }));
      }
      const previews = new Map();
      for (const el of dialog.querySelectorAll('[data-preview], [data-cover]')) {
        const node = nodesById.get(el.dataset.cover); if (node?.cover) continue;
        const board = el.dataset.preview ? data.boards.find(b => b.id === el.dataset.preview) : data.boards.find(b => {
          if (b.boardParent) return false;
          let parent = b.parent; const seen = new Set();
          while (parent && !seen.has(parent)) { if (parent === el.dataset.cover) return true; seen.add(parent); parent = nodesById.get(parent)?.parent; }
          return false;
        });
        if (board) previews.set(el, board);
      }
      observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); preview(entry.target, previews.get(entry.target), version); } }, { root: dialog, rootMargin: '180px' });
      for (const el of previews.keys()) observer.observe(el);
    }
    search.oninput = () => { query = search.value; tiles(); };
    tiles();
    if (focusedSearch) search.focus({ preventScroll: true });
  }
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
    const into = e.target.closest('[data-into]'); if (into) { at = into.dataset.into || null; query = ''; return render(); }
    const board = e.target.closest('[data-open]'); if (board) { close(); return open(board.dataset.open); }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') close();
    if (action === 'back') { at = getData().nodes.find(n => n.id === at)?.parent ?? null; query = ''; render(); }
  });
  function editName(id) {
    const tile = [...dialog.querySelectorAll('[data-item]')].find(el => el.dataset.item === id), field = tile?.querySelector('strong');
    if (!field || editing) return;
    const before = field.textContent; editing = true; field.contentEditable = 'plaintext-only'; field.focus(); getSelection()?.selectAllChildren(field);
    dialog.querySelector('[data-home-new]').disabled = true;
    let done = false;
    const finish = async keep => {
      if (done) return; done = true; field.onblur = null; field.contentEditable = 'false';
      const value = field.textContent.trim();
      try { if (keep && value && value !== before) await rename(id, value); }
      finally { editing = false; render(); }
    };
    field.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); finish(e.key === 'Enter'); } };
    field.onblur = () => finish(true);
  }
  dialog.addEventListener('contextmenu', e => { const item = e.target.closest('[data-item]'); if (item) { e.preventDefault(); menu(e.clientX, e.clientY, item.dataset.item); } });
  addEventListener('keydown', e => { if (dialog.open && !editing && e.key === 'Escape') { if (newMenu?.opened || [...coverMenus].some(menu => menu.opened)) return; e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
  return { show() { returnFocus = document.activeElement; at = null; query = ''; dialog.showModal(); render(); dialog.querySelector('[data-home-search]').focus(); }, refresh: render, close, rename: editName };
}
