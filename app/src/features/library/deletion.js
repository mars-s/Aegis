// Keep a confirmed deletion recoverable until its short Undo period has elapsed.
export function libraryDeletion({ host, current, refresh, open, toast }) {
  const key = `aegis:library-deletion:${host.base}`;
  const notice = document.createElement('div'); notice.className = 'library-undo'; notice.setAttribute('role', 'status'); notice.hidden = true;
  notice.innerHTML = '<span></span><button type="button" data-library-undo>Undo</button>'; document.body.append(notice);
  let pending, timer, committing = false;
  try { pending = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  const save = () => { if (pending) localStorage.setItem(key, JSON.stringify(pending)); else localStorage.removeItem(key); };
  function show() {
    if (!pending) return;
    notice.querySelector('span').textContent = `Deleted "${pending.name}"`;
    (document.querySelector('.library-home[open]') ?? document.body).append(notice); notice.hidden = false;
    clearTimeout(timer); timer = setTimeout(commit, Math.max(0, pending.until - Date.now()));
  }
  async function commit() {
    if (!pending || committing) return; committing = true; const deleting = pending;
    notice.querySelector('button').disabled = true;
    try {
      await host.post(deleting.board ? `/boards/${deleting.id}/delete` : '/library', deleting.board ? {} : { op: 'delete', id: deleting.id, recursive: true });
      pending = null; save(); notice.hidden = true; await refresh();
    } catch (e) { pending = null; save(); notice.hidden = true; await refresh(); toast(`Could not delete "${deleting.name}": ${e.message}. It is still in your library.`); }
    finally { committing = false; notice.querySelector('button').disabled = false; }
  }
  async function undo() {
    if (!pending || committing) return false;
    clearTimeout(timer); const previous = pending.current; pending = null; save(); notice.hidden = true; await refresh();
    if (previous) await open(previous); return true;
  }
  notice.querySelector('button').onclick = () => undo().catch(e => toast(e.message));
  addEventListener('keydown', e => { if (pending && !committing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !e.target.closest('input, textarea, [contenteditable]')) { e.preventDefault(); e.stopImmediatePropagation(); void undo(); } }, true);
  const observer = new MutationObserver(() => { if (!notice.isConnected && pending) show(); }); observer.observe(document.body, { childList: true, subtree: true });
  return {
    filter(data) { if (!pending) return data; const gone = new Set(pending.ids); return { ...data, nodes: data.nodes.filter(n => !gone.has(n.id)), boards: data.boards.filter(b => !gone.has(b.id)) }; },
    async remove(item, data) {
      if (committing) return;
      if (!confirm(`Delete "${item.name}" and everything inside it? You can Undo for 8 seconds.`)) return;
      if (pending) { clearTimeout(timer); await commit(); }
      const ids = new Set([item.id]); let previous;
      do { previous = ids.size; for (const node of [...data.nodes, ...data.boards]) if (ids.has(node.boardParent ?? node.parent)) ids.add(node.id); } while (ids.size !== previous);
      if (!data.boards.some(b => !ids.has(b.id))) await host.post('/boards', { name: 'First board' });
      pending = { id: item.id, name: item.name, board: data.boards.some(b => b.id === item.id), ids: [...ids], current: current(), until: Date.now() + 8000 };
      save(); show(); await refresh();
    },
    resume: show,
  };
}
