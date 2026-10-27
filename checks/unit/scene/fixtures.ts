import { BoardSchema, CardSchema, RevisionSchema } from '@aegis/domain/schema';
import type { Card, CardId } from '@aegis/domain/schema';
import type { SceneChange } from '../../../packages/scene/src/types.js';

export const card = (id: string, x = 0, y = 0, w = 240, h = 160): Card => CardSchema.parse({ id, type: 'note', text: id, color: 'plain', x, y, w, h });
export const board = (cards: readonly Card[]) => BoardSchema.parse({ id: 'scene-test', name: 'Scene test', rev: 0, cards, links: [], view: { x: 0, y: 0, z: 1 } });
export const delta = (upserted: readonly Card[], removed: readonly CardId[] = []): SceneChange => ({ kind: 'change', boardId: board([]).id, baseRevision: RevisionSchema.parse(0), revision: RevisionSchema.parse(1), upserted, removed, links: null, order: null });
