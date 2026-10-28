import './register.ts';
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
import { CardIdSchema } from '@aegis/domain/schema';
import { emptyBoard } from '@aegis/domain/commands';
const { SlideView } = await import('../../../app/src/editors/deck/Slide.tsx');
const { identifiedSlide, newSlide } = await import('../../../app/src/editors/deck/model.tsx');
const { deckSession } = await import('../../../app/src/editors/deck/session.tsx');
const { createWorkspace } = await import('../../../app/src/workspace/store.ts');
export { newSlide };
export const { chartTicks } = await import('../../../app/src/editors/deck/chart.tsx');
export const { lineChart } = await import('../../../app/src/platform/deck-test.tsx');
export function slideHTML(value: unknown, editable = false): string {
  const slide = identifiedSlide(value), workspace = createWorkspace({ board: emptyBoard('host-slide') });
  const deckId = CardIdSchema.parse('host-deck');
  const services = { assetUrl: (url: string) => url, menu: () => ({ destroy() {} }) };
  try {
    return renderToStaticMarkup(createElement(SlideView, { slide, workspace, services, deckId,
      ...(editable ? { session: deckSession(workspace, deckId) } : {}) }));
  } finally { workspace.dispose(); }
}
