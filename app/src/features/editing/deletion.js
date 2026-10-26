// A visible action for the same history entry used by Cmd+Z.
export function deletionNotice({ canvas }, history) {
  const notice = document.createElement('div'); notice.className = 'library-undo canvas-undo'; notice.setAttribute('role', 'status'); notice.hidden = true;
  notice.innerHTML = '<span></span><span aria-hidden="true">·</span><button type="button">Undo</button>'; document.body.append(notice);
  const signature = () => JSON.stringify([canvas.board.cards, canvas.board.links, canvas.board.tray, canvas.board.palette]);
  let pending, timer;
  function clear() { pending = null; clearTimeout(timer); notice.hidden = true; }
  function undo() {
    if (!pending) return false;
    const previous = pending;
    if (canvas.board.id !== previous.boardId || signature() !== previous.after) { clear(); return false; }
    const heldFocus = notice.contains(document.activeElement); clear();
    if (!history.travel(-1)) return false;
    canvas.select(previous.selection.filter(id => canvas.board.cards.some(card => card.id === id)));
    if (heldFocus) document.getElementById('stage').focus({ preventScroll: true });
    return true;
  }
  notice.querySelector('button').onclick = undo;
  document.getElementById('stage').addEventListener('boardchange', () => {
    if (pending && (canvas.board.id !== pending.boardId || signature() !== pending.after)) clear();
  });
  return {
    undo,
    prepare() {
      history.flush();
      const boardId = canvas.board.id, selection = canvas.selection();
      return () => {
        if (canvas.board.id !== boardId) return;
        const count = selection.filter(id => !canvas.board.cards.some(card => card.id === id)).length;
        if (count) this.show(selection, count);
      };
    },
    show(selection, count) {
      clear(); history.flush();
      pending = { boardId: canvas.board.id, selection, after: signature() };
      notice.querySelector('span').textContent = `Deleted ${count} window${count === 1 ? '' : 's'}`;
      notice.hidden = false; timer = setTimeout(() => { notice.hidden = true; }, 5000);
    },
  };
}
