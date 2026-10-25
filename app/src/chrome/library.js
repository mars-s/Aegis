// Library panel: projects > folders > boards, plus loose boards. Drag rows to refile them.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ICON = {
  project: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2.5"/><path d="M2 6.5h12"/></svg>',
  folder: '<svg viewBox="0 0 16 16"><path d="M2 4.5c0-.8.7-1.5 1.5-1.5h3l1.5 1.5h4.5c.8 0 1.5.7 1.5 1.5v5.5c0 .8-.7 1.5-1.5 1.5h-9c-.8 0-1.5-.7-1.5-1.5z"/></svg>',
  board: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.5 6h5M5.5 9h3"/></svg>',
};

export function createLibrary({ el, host, current, openBoard, toast }) {
  let data = { nodes: [], boards: [] };
  let target = localStorage.getItem('aegis:lib-target') || null; // project or folder that new things go into
  const open = new Set(JSON.parse(localStorage.getItem('aegis:lib-open') || '[]'));
  const tree = el.querySelector('.tree');

  async function refresh() {
    data = await host.get('/library');
    if (target && !data.nodes.some(n => n.id === target)) target = null;
    render();
  }
  function render() {
    const kids = parent => data.nodes.filter(n => n.parent === parent).sort((a, b) => a.name.localeCompare(b.name));
    const boardsIn = parent => data.boards.filter(b => b.parent === parent).sort((a, b) => a.name.localeCompare(b.name));
    const rows = [];
    const boardRow = (b, depth) => rows.push(`<div class="tree-row board${b.id === current() ? ' on' : ''}" draggable="true" data-board="${esc(b.id)}" style="--d:${depth}" title="${esc(b.name)}">${ICON.board}<span class="name">${esc(b.name)}</span><span class="meta">${b.cards || ''}</span></div>`);
    const nodeRow = (n, depth) => {
      const empty = !data.nodes.some(x => x.parent === n.id) && !data.boards.some(b => b.parent === n.id);
      const isOpen = open.has(n.id);
      rows.push(`<div class="tree-row node ${n.kind}${n.id === target ? ' target' : ''}" draggable="${n.kind === 'folder'}" data-node="${esc(n.id)}" style="--d:${depth}" aria-expanded="${isOpen}">`
        + `<button class="twisty" tabindex="-1" aria-label="${isOpen ? 'Collapse' : 'Expand'}"><svg viewBox="0 0 10 10"><path d="M3.5 2 7 5 3.5 8"/></svg></button>${ICON[n.kind]}<span class="name">${esc(n.name)}</span>`
        + (empty ? `<button class="del" title="Delete ${n.kind}" aria-label="Delete ${esc(n.name)}">×</button>` : '') + '</div>');
      if (isOpen) { for (const k of kids(n.id)) nodeRow(k, depth + 1); for (const b of boardsIn(n.id)) boardRow(b, depth + 1); }
    };
    for (const p of kids(null)) nodeRow(p, 0);
    const loose = boardsIn(null);
    if (loose.length) { rows.push(`<div class="tree-sep${target === null ? ' target' : ''}" data-node="">Loose boards</div>`); for (const b of loose) boardRow(b, 0); }
    tree.innerHTML = rows.join('') || '<p class="muted small pad">No boards yet.</p>';
  }

  const setTarget = id => { target = id || null; localStorage.setItem('aegis:lib-target', target ?? ''); render(); };
  const saveOpen = () => localStorage.setItem('aegis:lib-open', JSON.stringify([...open]));
  const change = async op => { try { const r = await host.post('/library', op); await refresh(); return r; } catch (e) { toast(e.message); } };

  tree.addEventListener('click', e => {
    const row = e.target.closest('.tree-row, .tree-sep'); if (!row) return;
    if (row.dataset.board) { openBoard(row.dataset.board); return; }
    const id = row.dataset.node;
    if (e.target.closest('.del')) { const n = data.nodes.find(x => x.id === id); if (n && confirm(`Delete ${n.kind} "${n.name}"?`)) change({ op: 'delete', id }); return; }
    const toggle = () => { open.has(id) ? open.delete(id) : open.add(id); saveOpen(); };
    if (id && e.target.closest('.twisty')) { toggle(); render(); return; }
    // First click picks it as the place new things go; clicking it again folds or unfolds it.
    if (id) { if (target === id) toggle(); else { open.add(id); saveOpen(); } }
    setTarget(id);
  });
  // Double-click a name to rename it in place.
  tree.addEventListener('dblclick', e => {
    const row = e.target.closest('.tree-row'); const name = row?.querySelector('.name'); if (!name) return;
    name.contentEditable = 'plaintext-only'; name.focus(); getSelection().selectAllChildren(name);
    const done = async keep => {
      name.contentEditable = 'false'; const v = name.textContent.trim();
      if (!keep || !v) return render();
      if (row.dataset.board) { await host.post(`/boards/${row.dataset.board}/name`, { name: v }); if (row.dataset.board === current()) document.dispatchEvent(new CustomEvent('board-renamed', { detail: v })); await refresh(); }
      else change({ op: 'rename', id: row.dataset.node, name: v });
    };
    name.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); name.onblur = null; done(true); } if (ev.key === 'Escape') { name.onblur = null; done(false); } };
    name.onblur = () => done(true);
  });
  // Drag a board or folder onto a project, folder or "Loose boards".
  tree.addEventListener('dragstart', e => {
    const row = e.target.closest('.tree-row'); if (!row) return;
    e.dataTransfer.setData('application/x-aegis-lib', row.dataset.board || row.dataset.node); e.dataTransfer.effectAllowed = 'move';
  });
  tree.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('application/x-aegis-lib')) return;
    const drop = e.target.closest('.tree-row.node, .tree-sep'); tree.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    if (drop) { e.preventDefault(); drop.classList.add('drop'); }
  });
  tree.addEventListener('dragleave', e => { if (!tree.contains(e.relatedTarget)) tree.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); });
  tree.addEventListener('drop', e => {
    const id = e.dataTransfer.getData('application/x-aegis-lib'); const drop = e.target.closest('.tree-row.node, .tree-sep');
    if (!id || !drop) return; e.preventDefault();
    const parent = drop.dataset.node || null; if (parent) open.add(parent), saveOpen();
    change({ op: 'move', id, parent });
  });

  el.querySelector('[data-add="board"]').onclick = async () => {
    const b = await host.post('/boards', { name: 'Untitled', parent: target }).catch(e => toast(e.message));
    if (b) { if (target) { open.add(target); saveOpen(); } await refresh(); openBoard(b.id); }
  };
  el.querySelector('[data-add="folder"]').onclick = async () => {
    if (!target) return toast('Pick a project or folder first. Folders live inside one.');
    const r = await change({ op: 'create', kind: 'folder', name: 'New folder', parent: target });
    if (r?.created) { open.add(target); saveOpen(); setTarget(r.created); }
  };
  el.querySelector('[data-add="project"]').onclick = async () => {
    const r = await change({ op: 'create', kind: 'project', name: 'New project' });
    if (r?.created) { open.add(r.created); saveOpen(); setTarget(r.created); }
  };

  return { refresh, render };
}
