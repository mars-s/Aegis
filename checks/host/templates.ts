import './adapters/register.ts';
import { z } from 'zod/v4';
import { CardSchema, CardIdSchema } from '@aegis/domain/schema';
import { frameworks, starters, templateCommands as createTemplate } from '../../app/src/chrome/templates.ts';
import { fixtureBoard, fixtureCard } from './adapters/inputs.ts';
const { descendants } = await import('../../app/src/features/editing/operations.ts');
const { dropCommands } = await import('../../app/src/features/wireframe/commands.ts');
export { frameworks, starters };
export function templateCommands(key: string, board: unknown) { return createTemplate(key, fixtureBoard(board)); }
export function expandTemplateDrag(cards: unknown, board: unknown) {
  return descendants(fixtureBoard(board), z.array(CardSchema).parse(z.array(z.unknown()).parse(cards).map(fixtureCard)).map(card => card.id));
}
const update = z.object({ op: z.literal('update'), id: CardIdSchema, set: z.object({ parent: z.string() }) });
export function templateDropCommands(cards: unknown, board: unknown, kind: 'move' | 'resize') {
  return z.array(update).parse(dropCommands(z.array(z.unknown()).parse(cards).map(fixtureCard), fixtureBoard(board), kind));
}
