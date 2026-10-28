import './adapters/register.ts';
import { z } from 'zod/v4';
import { CardIdSchema } from '@aegis/domain/schema';
import { frameworks, starters, templateCommands as createTemplate, expandTemplateDrag as expand, templateDropCommands as drop } from '../../app/src/chrome/templates.ts';
import { fixtureBoard, fixtureCard } from './adapters/inputs.ts';
export { frameworks, starters };
export function templateCommands(key: string, board: unknown) { return createTemplate(key, fixtureBoard(board)); }
export function expandTemplateDrag(cards: unknown, board: unknown) {
  return expand(z.array(z.unknown()).parse(cards).map(fixtureCard), fixtureBoard(board));
}
const update = z.object({ op: z.literal('update'), id: CardIdSchema, set: z.object({ parent: z.string() }) });
export function templateDropCommands(cards: unknown, board: unknown, kind: 'move' | 'resize') {
  return z.array(update).parse(drop(z.array(z.unknown()).parse(cards).map(fixtureCard), fixtureBoard(board), kind));
}
