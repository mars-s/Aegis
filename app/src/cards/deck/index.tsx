import type { CardBodyProps, CardRegistration, EditorRegistration } from '../../composition.js';
import { DeckBody } from './Deck.js';
import { DeckEditor } from '../../editors/deck/DeckEditor.js';
import { flushDeck } from '../../editors/deck/session.js';
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
