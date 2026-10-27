import { CardIdSchema } from '@aegis/domain';
import type { CardId } from '@aegis/domain';
import { z } from 'zod/v4';
import type { FeatureContext } from '../composition.js';

const OpenCardSchema = z.object({ id: CardIdSchema, full: z.boolean().optional(), keyboard: z.boolean().optional(), viaKey: z.boolean().optional() });

export function openCardEditor(id: CardId, full = false): void {
  window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id, full } }));
}

export function installEditorActions(context: FeatureContext): () => void {
  const open = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const value: unknown = event.detail;
    const parsed = OpenCardSchema.safeParse(value);
    if (parsed.success) context.openEditor(parsed.data.id, parsed.data.full, parsed.data.keyboard ?? parsed.data.viaKey);
  };
  const key = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
      const opened = context.workspace.ui.getSnapshot().editor;
      if (opened) { event.preventDefault(); event.stopImmediatePropagation(); context.openEditor(opened.id, opened.view !== 'full', true); }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape' && context.workspace.ui.getSnapshot().editor) {
      context.closeEditor(); event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    if (event.key !== 'Enter' || event.target instanceof Element && event.target.closest('input, textarea, select, button, [contenteditable="true"], [role="textbox"]')) return;
    const id = context.workspace.selection.getSnapshot()[0];
    if (id && context.openEditor(id, false, true)) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  window.addEventListener('aegis:open-card', open);
  const escape = (): void => { context.closeEditor(); };
  window.addEventListener('aegis:object-escape', escape);
  window.addEventListener('keydown', key, true);
  return () => {
    window.removeEventListener('aegis:open-card', open);
    window.removeEventListener('aegis:object-escape', escape);
    window.removeEventListener('keydown', key, true);
  };
}
