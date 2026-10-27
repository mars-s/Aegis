import type { CardId } from '@aegis/domain';
import type { FeatureContext } from '../composition.js';
import { stackCommands } from '../features/editing/registration.js';
import { menuShortcut } from '../lib/shortcuts.js';
import { locked } from './model.js';
import { submit } from './actions.js';
import type { Notify } from './actions.js';

export const stacking = [
  { id: 'forward', label: 'Bring forward', shortcut: 'mod+alt+]', copy: 'stackForward' },
  { id: 'backward', label: 'Send backward', shortcut: 'mod+alt+[', copy: 'stackBack' },
  { id: 'front', label: 'Bring to front', shortcut: 'mod+alt+shift+]', copy: 'stackToFront' },
  { id: 'back', label: 'Send to back', shortcut: 'mod+alt+shift+[', copy: 'stackToBack' },
] as const;

export function restack(context: FeatureContext, ids: readonly CardId[], direction: typeof stacking[number]['id'], notify: Notify): void {
  const board = context.workspace.scene.snapshot();
  const editable = ids.filter(id => { const card = board.cards.find(card => card.id === id); return card && !locked(board, card); });
  submit(context, stackCommands(board, editable, direction), notify);
}

export const stackMenu = (context: FeatureContext, ids: readonly CardId[], notify: Notify) => stacking.map(action => ({ title: action.label, shortcut: menuShortcut(action.copy), run: () => restack(context, ids, action.id, notify) }));
