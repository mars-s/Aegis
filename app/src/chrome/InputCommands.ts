import { z } from 'zod/v4';
import { CommandSchema } from '@aegis/domain';
import type { Board, Command } from '@aegis/domain';
import { PreferencesSchema } from '../features/settings/preferences-store.js';

const fields = z.record(z.string(), z.unknown());
const geometry = ['x', 'y', 'w', 'h', 'rot'] as const;

// Geometry repair adapted from Mochiboard (MIT). See LICENSE.mochiboard.
export function inputCommands(board: Board, input: unknown, noteColour: string | null): Command[] {
  const preferred = PreferencesSchema.shape.noteColour.safeParse(noteColour);
  return fields.array().parse(input).map(command => {
    const previous = board.cards.find(card => card.id === command['id']);
    const fallback = previous ?? { x: 0, y: 0, w: 200, h: 100, rot: 0 };
    const target = 'set' in command ? { ...fields.parse(command['set']) } : { ...command };
    for (const key of geometry) {
      const value = target[key];
      if (key in target && (typeof value !== 'number' || !Number.isFinite(value) || (key === 'w' || key === 'h') && value <= 0)) target[key] = fallback[key] ?? 0;
    }
    const repaired = 'set' in command ? { ...command, set: target } : target;
    if (repaired['op'] === 'create' && (repaired['type'] ?? 'note') === 'note' && repaired['color'] == null) repaired['color'] = preferred.success ? preferred.data : 'plain';
    return CommandSchema.parse(repaired);
  });
}
