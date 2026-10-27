import { expect, test } from 'vitest';
import { emptyBoard } from '@aegis/domain';
import { createWorkspace } from '../workspace/index.js';
import { inputCommands } from './InputCommands.js';

test('raw geometry is repaired before the optimistic and queued transport commands', () => {
  const workspace = createWorkspace({ board: emptyBoard('input-repair') });
  try {
    const value = [{ op: 'create', newId: 'repairaa', type: 'note', text: 'Keep the words', x: NaN, y: Infinity, w: -1, h: NaN, rot: Infinity }];
    const commands = inputCommands(workspace.scene.snapshot(), value, 'purple');
    expect(workspace.submit(commands).kind).toBe('applied');
    const card = workspace.scene.snapshot().cards[0];
    expect(card).toMatchObject({ x: 0, y: 0, w: 200, h: 100, rot: 0, text: 'Keep the words', color: 'purple' });
    expect(JSON.stringify(commands)).not.toMatch(/null/);
    expect(value[0]?.x).toBeNaN();
    const update = inputCommands(workspace.scene.snapshot(), [{ op: 'update', id: 'repairaa', set: { x: Infinity, w: 0, text: 'Later words' } }], null);
    expect(workspace.submit(update).kind).toBe('applied');
    expect(workspace.scene.snapshot().cards[0]).toMatchObject({ x: 0, w: 200, text: 'Later words', color: 'purple' });
  } finally { workspace.dispose(); }
});

test('geometry repair keeps valid metadata and still rejects malformed non-geometry data', () => {
  const board = emptyBoard('input-validation');
  expect(inputCommands(board, [{ op: 'create', type: 'note', x: 12, y: 23, w: 220, props: { future: { exact: ['keep', 42] } } }], 'invalid')).toEqual([{ op: 'create', type: 'note', x: 12, y: 23, w: 220, props: { future: { exact: ['keep', 42] } }, color: 'plain' }]);
  expect(() => inputCommands(board, [{ op: 'create', type: 'object', kind: 'stats', data: { tiles: [{ value: Infinity }] } }], null)).toThrow();
});
