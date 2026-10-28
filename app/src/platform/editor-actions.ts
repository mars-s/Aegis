import { CardIdSchema } from '@aegis/domain';
import type { CardId } from '@aegis/domain';
import { z } from 'zod/v4';
import type { FeatureContext } from '../composition.js';

const OpenCardSchema = z.object({ id: CardIdSchema, full: z.boolean().optional(), keyboard: z.boolean().optional(), viaKey: z.boolean().optional() });

export function openCardEditor(id: CardId, full = false): void {
  window.dispatchEvent(new CustomEvent('aegis:open-card', { detail: { id, full } }));
}

export function installEditorActions(context: FeatureContext): () => void {
  const modal = (target: EventTarget | null): boolean => target instanceof Element && !!target.closest('[role="dialog"][aria-modal="true"], dialog[open]');
  const double = (event: MouseEvent): void => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const stage = event.target.closest<HTMLElement>('#stage');
    if (!stage || event.target.closest('input, textarea, select, button, summary, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="gridcell"]')) return;
    const bounds = stage.getBoundingClientRect();
    const id = context.engine()?.hitTest({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    if (id && context.openEditor(id, false, false)) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const open = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const value: unknown = event.detail;
    const parsed = OpenCardSchema.safeParse(value);
    if (parsed.success) context.openEditor(parsed.data.id, parsed.data.full, parsed.data.keyboard ?? parsed.data.viaKey);
  };
  const key = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing || modal(event.target)) return;
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
    if (event.key !== 'Enter' || event.target instanceof Element && event.target.closest('input, textarea, select, button, summary, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="gridcell"]')) return;
    const id = context.workspace.selection.getSnapshot()[0];
    if (id && context.openEditor(id, false, true)) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  window.addEventListener('aegis:open-card', open);
  window.addEventListener('dblclick', double);
  const escape = (): void => { context.closeEditor(); };
  window.addEventListener('aegis:object-escape', escape);
  const earlyKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (event.target instanceof Element && event.target.closest('.side-editor, input, textarea, select, [contenteditable], [role="menu"], [role="listbox"], .aegis-dropdown-menu')) return;
      if (context.workspace.ui.getSnapshot().editor) key(event);
      return;
    }
    if (event.target instanceof Element && event.target.closest('.side-editor')) return;
    key(event);
  };
  const lateKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' || event.target instanceof Element && event.target.closest('.side-editor')) key(event);
  };
  window.addEventListener('keydown', earlyKey, true);
  window.addEventListener('keydown', lateKey);
  return () => {
    window.removeEventListener('aegis:open-card', open);
    window.removeEventListener('dblclick', double);
    window.removeEventListener('aegis:object-escape', escape);
    window.removeEventListener('keydown', earlyKey, true);
    window.removeEventListener('keydown', lateKey);
  };
}
