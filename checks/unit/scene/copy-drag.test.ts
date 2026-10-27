import { expect, test } from 'vitest';
import { CardIdSchema, LinkIdSchema } from '@aegis/domain';
import { copyDrag } from '../../../app/src/canvas/copy-drag.js';
import { createWorkspace } from '../../../app/src/workspace/store.js';
import { boardWith } from '../workspace/helpers.js';

test('copy plans remap children, groups and links and form one real Undo transaction', () => {
  const root = CardIdSchema.parse('copyroot'), a = CardIdSchema.parse('copykid1'), b = CardIdSchema.parse('copykid2');
  const board = boardWith([
    { op: 'create', type: 'coll', newId: root, text: 'Source', x: 100, y: 100, props: { kids: [a, b] } },
    { op: 'create', type: 'note', newId: a, parent: root, group: 'source-group', text: 'First', x: 120, y: 160 },
    { op: 'create', type: 'note', newId: b, parent: root, group: 'source-group', text: 'Second', x: 420, y: 160 },
    { op: 'connect', newId: LinkIdSchema.parse('copylink'), a, b },
  ]);
  const source = board.cards.find(card => card.id === root);
  if (!source) throw new Error('Missing copy root');
  const plan = copyDrag(board, { cards: [source], delta: { x: 60, y: 40 } });
  const workspace = createWorkspace({ board });
  expect(workspace.submit(plan.commands).kind).toBe('applied');
  const after = workspace.scene.snapshot(), copies = after.cards.filter(card => !board.cards.some(original => original.id === card.id));
  expect(copies).toHaveLength(3);
  expect(after.cards.filter(card => board.cards.some(original => original.id === card.id))).toEqual(board.cards);
  const parent = copies.find(card => card.type === 'coll'), first = copies.find(card => card.text === 'First'), second = copies.find(card => card.text === 'Second');
  if (!parent || !first || !second) throw new Error('Missing independent copies');
  expect(parent).toMatchObject({ x: source.x + 60, y: source.y + 40 });
  expect(parent.props?.kids).toEqual([first.id, second.id]);
  expect(first.parent).toBe(parent.id); expect(second.parent).toBe(parent.id);
  expect(first.group).not.toBe('source-group'); expect(first.group).toBe(second.group);
  expect(after.links).toHaveLength(2);
  expect(after.links.find(link => link.id !== 'copylink')).toMatchObject({ a: first.id, b: second.id });
  expect(plan.selection).toEqual(copies.map(card => card.id));
  workspace.undo();
  expect(workspace.scene.snapshot().cards).toEqual(board.cards);
  expect(workspace.scene.snapshot().links).toEqual(board.links);
  workspace.redo();
  expect(workspace.scene.snapshot().cards).toEqual(after.cards);
  expect(workspace.scene.snapshot().links).toEqual(after.links);
  workspace.dispose();
});
