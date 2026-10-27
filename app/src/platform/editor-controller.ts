import type { BoardId, Card, CardId } from '@aegis/domain';
import type { CameraState, CanvasEngine, Rect } from '@aegis/scene';
import { fitBounds, fromBounds, rotatedBounds } from '@aegis/scene/geometry';
import type { Composition, FeatureContext } from '../composition.js';
import type { Workspace } from '../workspace/index.js';

interface Bookmark { readonly board: BoardId; readonly camera: CameraState; readonly viewport: Rect; readonly selection: readonly CardId[]; readonly invoker: HTMLElement | null; readonly invokerSelector: string | null }
const bodyKind = (card: Card | null) => card?.type === 'object' ? `object:${card.kind}` : card?.type;

export function createEditorController(args: { readonly workspace: Workspace; readonly engine: () => CanvasEngine | null; readonly composition: Composition; readonly cameraChanged: () => void }) {
  const { workspace } = args;
  let framed: { readonly id: CardId; readonly area: Rect } | null = null, frameRelease: (() => void) | null = null;
  let bookmark: Bookmark | null = null, returning: (() => void) | null = null;
  let interaction: 'pointer' | 'keyboard' = 'keyboard', inputVersion = 0, selectionVersion = 0, instantMotion = true;
  const instant = (): boolean => instantMotion;
  const reduced = (keyboard: boolean): boolean => keyboard || document.body.classList.contains('motion-off');
  function flush(): boolean {
    const opened = workspace.ui.getSnapshot().editor;
    if (!opened) return true;
    const card = workspace.record(opened.id).getSnapshot();
    if (!card) return true;
    return args.composition.editors.find(editor => editor.kind === bodyKind(card))?.flush(context, opened.id) ?? true;
  }
  function frame(card: Card, keyboard: boolean): void {
    const engine = args.engine(); if (!engine) return;
    if (!frameRelease) frameRelease = engine.registerFrameParticipant({ read() {
      const opened = workspace.ui.getSnapshot().editor;
      if (!framed || !opened || opened.view === 'full' || opened.id !== framed.id || engine.busy()) return;
      const area = engine.availableArea(), previous = framed.area;
      if (area.x === previous.x && area.y === previous.y && area.width === previous.width && area.height === previous.height) return;
      framed = { id: opened.id, area };
      engine.afterInput(() => { const current = workspace.ui.getSnapshot().editor, source = workspace.record(opened.id).getSnapshot(); if (framed && current?.id === opened.id && source) frame(source, true); });
    } });
    const viewport = engine.viewport(), available = engine.availableArea();
    framed = { id: card.id, area: available };
    const area = { x: available.x + 24, y: available.y + 24, width: Math.max(1, Math.min(available.width, viewport.width / 2 - available.x - 24) - 48), height: Math.max(1, available.height - 48) };
    const camera = fitBounds(fromBounds(rotatedBounds({ x: card.x, y: card.y, width: card.w, height: card.h }, card.rot ?? 0)), area, 1);
    engine.navigate({ kind: 'restore', camera, motion: keyboard ? 'instant' : 'glide' }); args.cameraChanged();
  }
  const context: FeatureContext = {
    workspace, engine: args.engine,
    openEditor(id, full, keyboard = interaction === 'keyboard') {
      const card = workspace.record(id).getSnapshot();
      if (!card || !args.composition.editors.some(editor => editor.kind === bodyKind(card))) return false;
      const engine = args.engine(), opened = workspace.ui.getSnapshot().editor;
      if (opened?.id === id) {
        workspace.act({ kind: 'edit', id, view: full ? 'full' : 'side' });
        if (!full) frame(card, keyboard);
        return true;
      }
      if (opened && !flush()) return false;
      instantMotion = reduced(keyboard);
      returning?.(); returning = null;
      if (engine && !bookmark) bookmark = { board: workspace.metadata.getSnapshot().id, camera: engine.camera(), viewport: engine.viewport(), selection: [...workspace.selection.getSnapshot()], invoker: document.activeElement instanceof HTMLElement && document.activeElement !== document.body && document.activeElement.id !== 'stage' ? document.activeElement : null, invokerSelector: document.activeElement instanceof Element && document.activeElement.closest('#selectionBar') ? '#selectionBar [aria-label="Open"]' : document.activeElement instanceof Element && document.activeElement.matches('.win-open') ? `.card[data-id="${CSS.escape(id)}"] .win-open` : null };
      if (opened) engine?.pin(opened.id, 'editor', false);
      engine?.pin(id, 'editor', true);
      workspace.act({ kind: 'edit', id, view: full ? 'full' : 'side' });
      frame(card, keyboard);
      return true;
    },
    closeEditor() {
      const opened = workspace.ui.getSnapshot().editor;
      if (!opened) return true;
      if (!flush()) return false;
      instantMotion = reduced(interaction === 'keyboard');
      workspace.act({ kind: 'edit-close' });
      const engine = args.engine(), previous = bookmark;
      bookmark = null; framed = null;
      engine?.pin(opened.id, 'editor', false);
      returning?.(); returning = null;
      if (!engine || !previous || previous.board !== workspace.metadata.getSnapshot().id) return true;
      const targetForViewport = (): CameraState => {
        const viewport = engine.viewport();
        return { ...previous.camera, x: previous.camera.x + (viewport.width - previous.viewport.width) / 2, y: previous.camera.y + (viewport.height - previous.viewport.height) / 2 };
      };
      let target = targetForViewport();
      workspace.act({ kind: 'select', ids: previous.selection.filter(id => workspace.record(id).getSnapshot() !== null) });
      const input = inputVersion, selection = selectionVersion;
      const finish = (): void => {
        returning?.(); returning = null;
        const camera = engine.camera();
        if (camera.x !== target.x || camera.y !== target.y || camera.zoom !== target.zoom) return;
        engine.afterInput(() => {
          if (inputVersion !== input || selectionVersion !== selection || workspace.ui.getSnapshot().editor || workspace.metadata.getSnapshot().id !== previous.board) return;
          const invoker = previous.invoker?.isConnected ? previous.invoker : previous.invokerSelector ? document.querySelector<HTMLElement>(previous.invokerSelector) : null;
          (invoker ?? document.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(opened.id)}"]`))?.focus({ preventScroll: true });
        });
      };
      returning = engine.registerFrameParticipant({ read: () => {
        const measured = targetForViewport();
        if (measured.x !== target.x || measured.y !== target.y) {
          target = measured;
          engine.navigate({ kind: 'restore', camera: target, motion: instantMotion ? 'instant' : 'glide' });
          args.cameraChanged();
          return;
        }
        if (!engine.busy()) finish();
      } });
      engine.navigate({ kind: 'restore', camera: target, motion: interaction === 'keyboard' ? 'instant' : 'glide' });
      args.cameraChanged();
      return true;
    },
  };
  const install = (): (() => void) => {
    const pointer = (event: PointerEvent): void => { interaction = 'pointer'; inputVersion++; if (event.target instanceof Element && event.target.closest('#stage')) framed = null; };
    const key = (event: KeyboardEvent): void => { interaction = 'keyboard'; inputVersion++; if (event.code === 'Space' || event.key === '0') framed = null; };
    const wheel = (): void => {
      inputVersion++; framed = null;
      if (!returning) return;
      returning(); returning = null;
      const engine = args.engine();
      if (engine) engine.navigate({ kind: 'restore', camera: engine.camera(), motion: 'instant' });
    };
    window.addEventListener('pointerdown', pointer, true); window.addEventListener('keydown', key, true); window.addEventListener('wheel', wheel, { passive: true, capture: true });
    const selection = workspace.selection.subscribe(() => { selectionVersion++; });
    const scene = workspace.scene.subscribe(change => {
      if (change.kind === 'replace') { bookmark = null; returning?.(); returning = null; return; }
      const opened = workspace.ui.getSnapshot().editor;
      if (opened && !workspace.record(opened.id).getSnapshot()) context.closeEditor();
    });
    return () => { window.removeEventListener('pointerdown', pointer, true); window.removeEventListener('keydown', key, true); window.removeEventListener('wheel', wheel, true); selection(); scene(); returning?.(); returning = null; frameRelease?.(); frameRelease = null; framed = null; };
  };
  return { context, flush, install, instant };
}
