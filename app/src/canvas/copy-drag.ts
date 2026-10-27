import type { Board } from '@aegis/domain';
import type { DragCopyRequest, ToolCommit } from '@aegis/scene';
import { makeClip, cloneCommands } from '../features/editing/operations.js';

export function copyDrag(board: Board, request: DragCopyRequest): ToolCommit {
  const result = cloneCommands(makeClip(board, request.cards.map(card => card.id)), board, { x: 0, y: 0 }, 0);
  for (const command of result.commands) if (command.op === 'create') {
    command.x = (command.x ?? 0) + request.delta.x;
    command.y = (command.y ?? 0) + request.delta.y;
  }
  return { commands: result.commands, selection: result.ids };
}
