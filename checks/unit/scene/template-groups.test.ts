import { expect, it } from 'vitest';
import { BoardSchema } from '@aegis/domain';
import { wireframePolicies } from '../../../app/src/canvas/wireframe-policies.ts';

const board = () => BoardSchema.parse({ id: 'template-test', name: 'Template groups', rev: 0, links: [], view: { x: 0, y: 0, z: 1 }, cards: [
  { id: 'groupaaa', type: 'template-group', x: 0, y: 0, w: 288, h: 200, text: 'A', color: 'plain' },
  { id: 'groupbbb', type: 'template-group', x: 330, y: 0, w: 288, h: 200, text: 'B', color: 'plain' },
  { id: 'notecard', type: 'note', parent: 'groupaaa', x: 350, y: 50, w: 200, h: 100, text: 'Note', color: 'plain' },
] });

it('the composed drag policy carries saved template-group children', () => {
  const value = board(), group = value.cards[0];
  if (!group) throw new Error('Missing group fixture');
  expect(wireframePolicies(() => value).expandDrag?.([group.id], { shift: false, bypass: false })).toEqual([group.id, value.cards[2]?.id]);
});

it('the composed drop policy reparents notes, retains a moving group and detaches outside', () => {
  const value = board(), note = value.cards[2], group = value.cards[0];
  if (!note || !group) throw new Error('Missing group fixture');
  const policies = wireframePolicies(() => value);
  expect(policies.dropCommands?.({ cards: [note], kind: 'move' })).toEqual([{ op: 'update', id: note.id, set: { parent: 'groupbbb' } }]);
  expect(policies.dropCommands?.({ cards: [group, note], kind: 'move' })).toEqual([]);
  expect(policies.dropCommands?.({ cards: [{ ...note, x: 900 }], kind: 'move' })).toEqual([{ op: 'update', id: note.id, set: { parent: '' } }]);
});
