// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { createMenu } from './menu.js';
import { createHome } from '../features/library/home.js';
import { connectLibrary } from '../features/library/navigation.js';
import { escapeHtml as esc } from '../features/library/preview.js';

const ICON = {
  project: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2.5"/><path d="M2 6.5h12"/></svg>',
  folder: '<svg viewBox="0 0 16 16"><path d="M2 4.5c0-.8.7-1.5 1.5-1.5h3l1.5 1.5h4.5c.8 0 1.5.7 1.5 1.5v5.5c0 .8-.7 1.5-1.5 1.5h-9c-.8 0-1.5-.7-1.5-1.5z"/></svg>',
  board: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.5 6h5M5.5 9h3"/></svg>',
};
function savedOpen() { try { return JSON.parse(localStorage.getItem('aegis:lib-open') || '[]'); } catch { return []; } }
export function createLibrary({ el, host, current, openBoard, toast }) {
  let data = { nodes: [], boards: [] }, editing = null, lastCurrent, refreshing = 0, homeAt;
  let target = localStorage.getItem('aegis:lib-target') || null;
  const expanded = new Set(savedOpen());
  const tree = el.querySelector('.tree'), menu = createMenu();
  const menuEl = document.querySelector('.ctx-menu:last-child');
  const saveOpen = () => localStorage.setItem('aegis:lib-open', JSON.stringify([...expanded]));
  const setTarget = id => { target = id || null; localStorage.setItem('aegis:lib-target', target ?? ''); };
  const item = id => data.nodes.find(n => n.id === id) ?? data.boards.find(b => b.id === id);
  const isBoard = id => data.boards.some(b => b.id === id);
  const guard = fn => async (...args) => { try { return await fn(...args); } catch (e) { toast(e.message); } };
  const open = guard(async id => {
    await openBoard(id); render();
    const canvas = window.aegis?.canvas;
    if (canvas?.board.id === id && data.boards.find(b => b.id === id)?.boardParent) {
      if (canvas.board.cards.length) canvas.frameIds(canvas.board.cards.map(c => c.id));
      else { const stage = document.getElementById('stage'); canvas.setView({ x: stage.clientWidth / 2, y: stage.clientHeight / 2, z: 1 }); }
    }
  });
  async function refresh() {
    const version = ++refreshing, next = await host.get('/library');
    if (version !== refreshing) return;
    data = next;
    if (target && !data.nodes.some(n => n.id === target)) setTarget(null);
    if (current() && !data.boards.some(b => b.id === current()) && data.boards.length) await open(data.boards[0].id);
    if (!editing) render();
    home.refresh();
    document.dispatchEvent(new CustomEvent('library-refreshed'));
  }
  function revealCurrent() {
    if (homeAt !== undefined) return;
    const seen = new Set(), ancestors = [];
    let b = data.boards.find(b => b.id === current()); if (!b) return;
    while (b?.boardParent && !seen.has(b.id)) { seen.add(b.id); ancestors.push(b.boardParent); b = data.boards.find(x => x.id === b.boardParent); }
    const scope = b?.parent ?? null; let parent = scope;
    while (parent && !seen.has(parent)) { seen.add(parent); ancestors.push(parent); parent = data.nodes.find(n => n.id === parent)?.parent; }
    const signature = JSON.stringify([current(), ...ancestors]);
    if (lastCurrent === signature) return;
    lastCurrent = signature; setTarget(scope);
    ancestors.forEach(id => expanded.add(id)); saveOpen();
  }
  function breadcrumbs() {
    const nav = document.getElementById('boardCrumbs'); if (!nav) return;
    const chain = [], seen = new Set(); let b = data.boards.find(b => b.id === current());
    while (b?.boardParent && !seen.has(b.id)) { seen.add(b.id); b = data.boards.find(x => x.id === b.boardParent); if (b) chain.unshift(b); }
    nav.innerHTML = chain.map(b => `<button data-open="${esc(b.id)}" title="Open ${esc(b.name)}">${esc(b.name)}</button><span>/</span>`).join('');
    nav.onclick = e => { const id = e.target.closest('[data-open]')?.dataset.open; if (id) open(id); };
  }
  function scopeRoot(id) {
    let root = data.nodes.find(n => n.id === id); const seen = new Set();
    while (root?.parent && !seen.has(root.id)) { seen.add(root.id); root = data.nodes.find(n => n.id === root.parent) ?? root; }
    return root;
  }
  function render() {
    if (editing) return;
    revealCurrent(); breadcrumbs();
    const rows = [], seen = new Set();
    const children = parent => data.nodes.filter(n => n.parent === parent).sort((a, b) => a.name.localeCompare(b.name));
    const boardsIn = parent => data.boards.filter(b => b.parent === parent && !b.boardParent).sort((a, b) => a.name.localeCompare(b.name));
    const boardRow = (b, depth) => {
      if (seen.has(b.id)) return; seen.add(b.id);
      const kids = data.boards.filter(k => k.boardParent === b.id), isOpen = expanded.has(b.id);
      rows.push(`<div role="treeitem" class="tree-row board${b.id === current() ? ' on' : ''}" draggable="true" data-board="${esc(b.id)}" style="--d:${depth}" title="${esc(b.name)}"${kids.length ? ` aria-expanded="${isOpen}"` : ''}>${kids.length ? `<button class="twisty" tabindex="-1" aria-label="${isOpen ? 'Collapse' : 'Expand'}"><svg viewBox="0 0 10 10"><path d="M3.5 2 7 5 3.5 8"/></svg></button>` : ''}${ICON.board}<span class="name">${esc(b.name)}</span><span class="meta">${b.cards || ''}</span></div>`);
      if (isOpen) kids.forEach(k => boardRow(k, depth + 1));
    };
    const nodeRow = (n, depth) => {
      if (seen.has(n.id)) return; seen.add(n.id);
      const isOpen = expanded.has(n.id);
      rows.push(`<div role="treeitem" class="tree-row node ${n.kind}${n.id === target ? ' target' : ''}" draggable="${n.kind === 'folder'}" data-node="${esc(n.id)}" style="--d:${depth}" aria-expanded="${isOpen}"><button class="twisty" tabindex="-1" aria-label="${isOpen ? 'Collapse' : 'Expand'}"><svg viewBox="0 0 10 10"><path d="M3.5 2 7 5 3.5 8"/></svg></button>${ICON[n.kind]}<span class="name">${esc(n.name)}</span></div>`);
      if (isOpen) { children(n.id).forEach(k => nodeRow(k, depth + 1)); boardsIn(n.id).forEach(b => boardRow(b, depth + 1)); }
    };
    const root = scopeRoot(homeAt !== undefined ? homeAt : data.boards.find(b => b.id === current())?.parent);
    if (root) nodeRow(root, 0);
    else {
      children(null).forEach(n => nodeRow(n, 0));
      rows.push(`<div class="tree-sep${target === null ? ' target' : ''}" data-node="">Loose boards</div>`);
      boardsIn(null).forEach(b => boardRow(b, 0));
    }
    tree.innerHTML = rows.join('');
  }
  const change = guard(async op => { const r = await host.post('/library', op); await refresh(); if (op.op === 'move' && current()) await open(current()); return r; });
  async function create(kind, parent = target) {
    if (kind === 'board') {
      const b = await host.post('/boards', { name: 'Untitled', parent });
      if (parent) expanded.add(parent); saveOpen(); await refresh(); await open(b.id); return b;
    }
    const r = await change({ op: 'create', kind, name: kind === 'folder' ? 'New folder' : 'New project', parent });
    if (r?.created) { if (parent) expanded.add(parent); expanded.add(r.created); setTarget(r.created); saveOpen(); render(); }
    return r;
  }
  async function remove(id) {
    const n = item(id); if (!n) return;
    if (!confirm(`Delete "${n.name}" and all boards, folders and canvases inside it? This cannot be undone.`)) return;
    await host.post(isBoard(id) ? `/boards/${id}/delete` : '/library', isBoard(id) ? {} : { op: 'delete', id, recursive: true });
    await refresh(); if (current()) await open(current());
  }
  async function saveName(id, value) {
    if (isBoard(id)) {
      await host.post(`/boards/${id}/name`, { name: value });
      if (id === current()) document.dispatchEvent(new CustomEvent('board-renamed', { detail: value }));
    } else await host.post('/library', { op: 'rename', id, name: value });
  }
  function rename(id) {
    const row = [...tree.querySelectorAll('.tree-row')].find(r => (r.dataset.board || r.dataset.node) === id);
    const name = row?.querySelector('.name'); if (!name || editing) return;
    const before = name.textContent; editing = id;
    name.contentEditable = 'plaintext-only'; name.focus(); getSelection()?.selectAllChildren(name);
    let done = false;
    const finish = guard(async keep => {
      if (done) return; done = true; name.onblur = null; name.contentEditable = 'false';
      const value = name.textContent.trim();
      try {
        if (keep && value && value !== before) await saveName(id, value);
      } finally { editing = null; await refresh(); }
    });
    name.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); finish(ev.key === 'Enter'); } };
    name.onblur = () => finish(true);
  }
  function destinations(id) {
    const n = item(id), board = isBoard(id);
    const inside = candidate => { const seen = new Set(); let at = candidate; while (at && !seen.has(at)) { if (at === id) return true; seen.add(at); at = item(at)?.boardParent ?? item(at)?.parent; } return false; };
    const fullName = n => { const names = [n.name], seen = new Set([n.id]); let parent = n.boardParent ?? n.parent; while (parent && !seen.has(parent)) { seen.add(parent); const p = item(parent); if (!p) break; names.unshift(p.name); parent = p.boardParent ?? p.parent; } return names.join(' / '); };
    const options = [];
    options.push({ title: board ? 'Loose boards' : 'All projects (top level)', run: () => change({ op: 'move', id, parent: null }) });
    if (n.kind !== 'project') for (const dest of data.nodes.filter(d => !inside(d.id))) options.push({ title: `${fullName(dest)}${n.parent === dest.id && !n.boardParent ? ' (current)' : ''}`, run: () => change({ op: 'move', id, parent: dest.id }) });
    if (board) for (const dest of data.boards.filter(d => !inside(d.id))) options.push({ title: `Inside board: ${fullName(dest)}${n.boardParent === dest.id ? ' (current)' : ''}`, run: () => change({ op: 'move', id, boardParent: dest.id }) });
    return options;
  }
  function showMenu(x, y, id) {
    const n = item(id); if (!n) return;
    const modal = document.querySelector('.library-home[open]');
    (modal ?? document.body).append(menuEl);
    const items = [
      { title: 'Rename', run: () => { if (modal) return home.rename(id); revealItem(id); rename(id); } },
      { title: 'Move to…', run: () => menu.show(x + 20, y, destinations(id)) },
      { title: 'Duplicate', run: guard(async () => { const r = await host.post('/library/duplicate', { id }); await refresh(); if (isBoard(r.created)) await open(r.created); else { setTarget(r.created); expanded.add(r.created); saveOpen(); render(); } }) },
      { title: 'Delete', run: guard(() => remove(id)) },
    ];
    if (n.boardParent) items.splice(2, 0, { title: 'Make it its own board', run: () => change({ op: 'move', id, parent: n.parent }) });
    menu.show(x, y, items);
  }
  function revealItem(id) {
    const seen = new Set(); let parent = item(id)?.boardParent ?? item(id)?.parent;
    while (parent && !seen.has(parent)) { seen.add(parent); expanded.add(parent); parent = item(parent)?.boardParent ?? item(parent)?.parent; }
    saveOpen(); render();
  }
  const home = createHome({ getData: () => data, load: id => host.get(`/boards/${id}`), open, create: guard(create), menu: showMenu,
    scope: id => { if (homeAt !== id) { const root = scopeRoot(id); if (root) expanded.add(root.id); } homeAt = id; setTarget(id); render(); },
    onClose: () => { homeAt = undefined; lastCurrent = undefined; render(); },
    cover: (id, cover) => change({ op: 'cover', id, cover }), rename: guard(async (id, value) => { await saveName(id, value); await refresh(); }), toast });
  const homeButton = document.createElement('button'); homeButton.className = 'library-home-button'; homeButton.textContent = 'Home'; homeButton.onclick = guard(async () => { await refresh(); home.show(); }); tree.before(homeButton);
  connectLibrary({ open: async id => { await refresh(); await open(id); }, load: id => host.get(`/boards/${id}`), create: body => host.post('/boards', body), rename: guard(async (id, name) => { await host.post(`/boards/${id}/name`, { name }); await refresh(); }) });
  tree.addEventListener('click', e => {
    if (editing) return;
    const row = e.target.closest('.tree-row, .tree-sep'); if (!row) return;
    const id = row.dataset.board || row.dataset.node;
    const toggle = () => { expanded.has(id) ? expanded.delete(id) : expanded.add(id); saveOpen(); render(); };
    if (e.target.closest('.twisty')) return toggle();
    if (row.dataset.board) { if (current() !== id) return open(id); return; }
    if (id && target === id) toggle(); else if (id) { expanded.add(id); saveOpen(); }
    setTarget(id); render();
  });
  tree.addEventListener('dblclick', e => { const row = e.target.closest('.tree-row'); if (e.target.closest('.name') && row) rename(row.dataset.board || row.dataset.node); });
  tree.addEventListener('contextmenu', e => { const row = e.target.closest('.tree-row'); if (row) { e.preventDefault(); showMenu(e.clientX, e.clientY, row.dataset.board || row.dataset.node); } });
  tree.addEventListener('dragstart', e => { const row = e.target.closest('.tree-row'); if (!row || editing) return e.preventDefault(); e.dataTransfer.setData('application/x-aegis-lib', row.dataset.board || row.dataset.node); e.dataTransfer.effectAllowed = 'move'; });
  tree.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('application/x-aegis-lib')) return;
    tree.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    const row = e.target.closest('.tree-row, .tree-sep'); if (row) { e.preventDefault(); row.classList.add('drop'); }
  });
  tree.addEventListener('dragleave', e => { if (!tree.contains(e.relatedTarget)) tree.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); });
  tree.addEventListener('drop', e => {
    const id = e.dataTransfer.getData('application/x-aegis-lib'), row = e.target.closest('.tree-row, .tree-sep'); if (!id || !row) return;
    e.preventDefault(); tree.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    const parent = row.dataset.node || null, boardParent = row.dataset.board || null;
    if (parent || boardParent) expanded.add(parent || boardParent); saveOpen();
    change({ op: 'move', id, parent, boardParent });
  });
  for (const kind of ['board', 'folder', 'project']) el.querySelector(`[data-add="${kind}"]`).onclick = guard(() => create(kind));
  addEventListener('focus', guard(refresh));
  return { refresh, render };
}
