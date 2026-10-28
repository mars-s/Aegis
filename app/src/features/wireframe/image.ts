import type { CardId } from '@aegis/domain';
import type { FeatureWorkspace } from '../../composition.js';
import { WireProps } from '../../cards/creative/props.js';

export function requestWireframeImage(workspace: FeatureWorkspace, cardId: CardId, notify: (message: string) => void): void {
  const card = workspace.record(cardId).getSnapshot();
  if (!card) return;
  const props = WireProps.parse(card.props ?? {});
  const event = new CustomEvent('aegis:wireframe-image-request', { cancelable: true, detail: { cardId, label: props.img || 'Image', width: card.w, height: card.h, apply: workspace.submit } });
  if (!document.dispatchEvent(event)) return;
  workspace.submit([{ op: 'update', id: cardId, set: { props: { placeholder: true, src: null } } }]);
  notify('Filled with a local placeholder pattern. No AI image was generated.');
}
