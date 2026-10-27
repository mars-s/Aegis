import { CardIdSchema } from '@aegis/domain';
import type { CardId } from '@aegis/domain';
import { z } from 'zod/v4';
import type { FeatureContext } from '../composition.js';

const OpenCardSchema = z.object({ id: CardIdSchema, full: z.boolean().optional() });

export function openCardEditor(id: CardId, full = false): void {
  window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id, full } }));
}

export function installEditorActions(context: FeatureContext): () => void {
  const open = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const value: unknown = event.detail;
    const parsed = OpenCardSchema.safeParse(value);
    if (parsed.success) context.openEditor(parsed.data.id, parsed.data.full);
  };
  const key = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape' && context.workspace.ui.getSnapshot().editor) {
      if (context.closeEditor()) event.preventDefault();
      return;
    }
    if (event.key !== 'Enter' || event.target instanceof Element && event.target.closest('input, textarea, select, button, [contenteditable="true"], [role="textbox"]')) return;
    const id = context.workspace.selection.getSnapshot()[0];
    if (id && context.openEditor(id)) event.preventDefault();
  };
  window.addEventListener('aegis:open-card', open);
  window.addEventListener('keydown', key);
  return () => {
    window.removeEventListener('aegis:open-card', open);
    window.removeEventListener('keydown', key);
  };
}
