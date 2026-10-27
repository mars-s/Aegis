import { CardIdSchema } from '@aegis/domain';
import type { CardId, Command } from '@aegis/domain';
import { CARD_CATALOG } from '@aegis/domain/catalog';
import type { Point, ToolPointer } from '@aegis/scene';
import type { FeatureContext } from '../composition.js';
import { PreferencesSchema } from '../features/settings/preferences-store.js';
import { toolExit } from '../platform/tool-lifetime.js';
import type { Notify } from './actions.js';

type CoreTool = 'note' | 'title' | 'todo' | 'readme';
type Create = Extract<Command, { readonly op: 'create' }>;
function toolLayout(tool: CoreTool) {
  const type = tool === 'readme' ? 'note' : tool, size = CARD_CATALOG[type].size;
  return { type, x: tool === 'title' ? 20 : tool === 'todo' ? 130 : tool === 'readme' ? 120 : 110, y: tool === 'title' ? 28 : tool === 'readme' ? 40 : 30, width: tool === 'readme' ? 260 : size[0], height: tool === 'readme' ? 150 : size[1] };
}
function cardSpec(tool: CoreTool, at: Point, newId: CardId): Create {
  const layout = toolLayout(tool);
  const base = { op: 'create', type: layout.type, text: '', newId, x: Math.round(at.x) - layout.x, y: Math.round(at.y) - layout.y, w: layout.width, h: layout.height } satisfies Create;
  switch (tool) {
    case 'note': {
      const colour = PreferencesSchema.shape.noteColour.safeParse(localStorage.getItem('aegis:note-colour'));
      return { ...base, color: colour.success ? colour.data : 'plain' };
    }
    case 'title': return base;
    case 'todo': return { ...base, items: [] };
    case 'readme': return { ...base, color: 'green', heading: 'How this board works', badge: 'read me first' };
    default: { const exhaustive: never = tool; return exhaustive; }
  }
}

export function createCoreTools(context: FeatureContext, notify: Notify) {
  let pendingEdit: (() => void) | null = null;
  function edit(id: CardId): void {
    pendingEdit?.();
    const engine = context.engine(); if (!engine) return;
    let release = (): void => {}, unsubscribe = (): void => {};
    const cancel = (): void => { release(); unsubscribe(); if (pendingEdit === cancel) pendingEdit = null; };
    pendingEdit = cancel;
    unsubscribe = context.workspace.scene.subscribe(change => { if (change.kind === 'replace' || change.removed.includes(id)) cancel(); });
    release = engine.registerFrameParticipant({ read: () => {
      const field = engine.leases.getSnapshot().find(lease => lease.cardId === id)?.host.querySelector<HTMLElement>('[contenteditable="plaintext-only"],input:not([hidden])');
      if (!field) return;
      cancel();
      engine.afterInput(() => { if (field.isConnected && context.workspace.selection.getSnapshot().includes(id)) field.focus({ preventScroll: true }); });
    } });
  }
  function place(tool: CoreTool, at: Point): boolean {
    const id = CardIdSchema.parse(crypto.randomUUID().replaceAll('-', '').slice(0, 12));
    const result = context.workspace.submit([cardSpec(tool, at, id), { op: 'order', ids: [id], to: 'front' }]);
    if (result.kind === 'rejected') { notify({ text: result.errors.map(error => error.reason).join('\n') }); return false; }
    context.workspace.act({ kind: 'select', ids: [id] }); edit(id); return true;
  }
  function arm(tool: CoreTool): void {
    pendingEdit?.();
    const engine = context.engine(); if (!engine) return;
    context.workspace.act({ kind: 'select', ids: [] });
    const board = context.workspace.metadata.getSnapshot().id, release = toolExit(engine, tool);
    let active = true;
    const layout = toolLayout(tool);
    const finish = (): void => { active = false; engine.preview(null); release(); };
    const preview = (at: ToolPointer): void => {
      if (!active) return;
      engine.preview({ cursor: 'crosshair', primitives: [{ kind: 'rect', opacity: .6, space: 'world', bounds: { x: Math.round(at.world.x) - layout.x, y: Math.round(at.world.y) - layout.y, width: layout.width, height: layout.height }, radius: 8, fill: null, stroke: { colour: { kind: 'theme', token: 'muted' }, width: 1, dash: [] } }] });
    };
    engine.tool({ id: tool, accepts: at => active && at.button === 0, down: preview, move: points => { const at = points.at(-1); if (at) preview(at); }, up: at => {
      if (!active) return;
      engine.afterInput(() => { if (context.workspace.metadata.getSnapshot().id === board) place(tool, at.world); }); finish();
    }, acceptsKey: key => key.key === 'Escape', key: finish, cancel: finish });
    engine.preview({ cursor: 'crosshair', primitives: [] });
  }
  return { place, arm, dispose: (): void => { pendingEdit?.(); } };
}
