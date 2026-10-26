import { layerDescendants } from './layer-model.js';
import { effectiveFlag } from './model.js';
import { openLibraryBoard } from '../library/navigation.js';
import { confirmAction } from '../../lib/ui/confirm.js';

export function mountLayerDeletion({ canvas, apply, toast }, history) {
  document.getElementById('stage').addEventListener('layerdelete', async e => {
    const before = structuredClone(canvas.board);
    const ids = new Set(layerDescendants(before, e.detail.ids).filter(c => !effectiveFlag(before, c, 'locked')).map(c => c.id));
    if (!ids.size) return toast('Unlock the layer before deleting it');
    const label = ids.size === 1 ? 'this layer' : `${ids.size} layers`;
    if (!await confirmAction({ title: `Delete ${label}?`, body: 'You can Undo this change.' })) return;
    // The board may have changed while the question was open.
    if (canvas.board.id !== before.id) return;
    const live = new Set(canvas.board.cards.map(c => c.id)); for (const id of ids) if (!live.has(id)) ids.delete(id);
    if (!ids.size) return;
    history.flush(); apply([{ op: 'delete', ids: [...ids] }], () => canvas.select([])); history.flush();
    const notice = document.createElement('div'); notice.className = 'library-undo layer-undo'; notice.setAttribute('role', 'status'); notice.innerHTML = '<span>Layer deleted</span><button type="button">Undo</button>';
    document.querySelector('.layer-undo')?.remove(); document.body.append(notice);
    notice.querySelector('button').onclick = async () => {
      try {
        if (canvas.board.id !== before.id) await openLibraryBoard(before.id);
        if (canvas.board.id !== before.id) return;
        const current = canvas.board, present = new Set(current.cards.map(c => c.id));
        const missing = before.cards.filter(c => ids.has(c.id) && !present.has(c.id));
        const restoring = new Set(missing.map(c => c.id)), available = new Set([...present, ...restoring]);
        const commands = missing.map(({ id, ...card }) => ({ op: 'create', ...card, ...(card.parent && !available.has(card.parent) ? { parent: null } : {}), newId: id }));
        for (const card of missing) commands.push({ op: 'order', ids: [card.id], to: Math.min(before.cards.findIndex(c => c.id === card.id), current.cards.length + missing.length - 1) });
        for (const parent of before.cards.filter(c => c.props?.kids?.some(id => restoring.has(id)) && present.has(c.id))) {
          const kids = [...(current.cards.find(c => c.id === parent.id).props?.kids ?? [])];
          parent.props.kids.forEach((id, index) => { if (restoring.has(id) && !kids.includes(id)) kids.splice(Math.min(index, kids.length), 0, id); });
          commands.push({ op: 'update', id: parent.id, set: { props: { kids } } });
        }
        for (const { id, a, b, label, ...style } of before.links.filter(l => (restoring.has(l.a) || restoring.has(l.b)) && available.has(l.a) && available.has(l.b) && !current.links.some(k => k.id === l.id))) {
          commands.push({ op: 'connect', newId: id, a, b, label });
          if (Object.keys(style).length) commands.push({ op: 'link_update', id, set: style });
        }
        if (commands.length) apply(commands, () => canvas.select([...restoring]));
        notice.remove();
      } catch (e) { toast(`Could not restore the layer: ${e.message}`); }
    };
    setTimeout(() => notice.remove(), 8000);
  });
}
