import { JsonRecordSchema } from '@aegis/domain/schema';
import type { ActionRegistration, CardBodyProps, CardRegistration, EditorRegistration, FeatureContext } from '../../composition.js';
import { DeckBody } from './Deck.js';
import { DeckEditor } from '../../editors/deck/DeckEditor.js';
import { flushDeck } from '../../editors/deck/session.js';
import { newSlide } from '../../editors/deck/model.js';
import type { DeckServices } from '../../editors/deck/model.js';
export { DeckBody } from './Deck.js';
export { DeckEditor } from '../../editors/deck/DeckEditor.js';
export { flushDeck, deckSession } from '../../editors/deck/session.js';
export { SlideView } from '../../editors/deck/Slide.js';
export type { DeckServices } from '../../editors/deck/model.js';

export function deckCards(services: DeckServices): readonly CardRegistration[] {
  return [{ kind: 'deck', Body: (props: CardBodyProps) => <DeckBody {...props} services={services} /> }];
}
export function deckEditors(services: DeckServices): readonly EditorRegistration[] {
  return [{ kind: 'deck', Body: (props: CardBodyProps) => <DeckEditor {...props} services={services} />, flush: flushDeck }];
}
export function placeDeck(context: FeatureContext, at: { readonly x: number; readonly y: number }): void {
  const result = context.workspace.submit([{ op: 'create', type: 'deck', text: 'Untitled deck', x: Math.round(at.x - 235), y: Math.round(at.y - 176), props: JsonRecordSchema.parse({ slides: [{ ...newSlide(), title: 'Your next idea', sub: 'Click to write' }], current: 0 }), ref: 'deck' }]);
  if (result.kind !== 'applied') return;
  const id = result.created.deck;
  if (id) { context.workspace.act({ kind: 'select', ids: [id] }); context.openEditor(id); }
}
export const deckTools: readonly ActionRegistration[] = [{ id: 'deck', label: 'Slides', shortcut: 'b', run: context => {
  const stage = document.getElementById('stage'), engine = context.engine();
  if (stage && engine) placeDeck(context, engine.screenToWorld({ x: stage.clientWidth / 2, y: stage.clientHeight / 2 }));
} }];
