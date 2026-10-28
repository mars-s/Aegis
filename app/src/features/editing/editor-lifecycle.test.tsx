import { afterEach, expect, test, vi } from 'vitest';
import { applyBatch, BoardIdSchema, CardIdSchema, emptyBoard } from '@aegis/domain';
import { createWorkspace } from '../../workspace/index.js';
import { createEditorController } from '../../platform/editor-controller.js';
import type { Composition } from '../../composition.js';

afterEach(() => vi.unstubAllGlobals());
function setup(settled: () => Promise<void> = async () => {}) {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { body: { classList: { contains: () => true } } });
  const first = CardIdSchema.parse('snapshotfirst'), other = CardIdSchema.parse('snapshotother');
  const result = applyBatch(emptyBoard(BoardIdSchema.parse('snapshotboard'), 'Snapshot lifecycle'), { commands: [
    { op: 'create', newId: first, type: 'object', kind: 'html', data: { html: '<button>State</button>', css: '', js: '' } },
    { op: 'create', newId: other, type: 'note', text: 'Other editor' },
  ] });
  if (!result.ok) throw new Error('Invalid lifecycle fixture');
  const workspace = createWorkspace({ board: result.board });
  const requests: { readonly signal: AbortSignal; readonly finish: (ok: boolean) => void }[] = [];
  const composition: Composition = { cards: [], tools: [], panels: [], menus: [], editors: [
    { kind: 'object:html', Body: () => null, flush: () => true, prepare: (_context, _id, signal) => new Promise<boolean>(resolve => {
      requests.push({ signal, finish: resolve }); signal.addEventListener('abort', () => resolve(false), { once: true });
    }) },
    { kind: 'note', Body: () => null, flush: () => true },
  ] };
  const controller = createEditorController({ workspace, composition, engine: () => null, cameraChanged: () => {}, settled });
  return { workspace, controller, requests, first, other };
}

test('close retains the original editor and synchronous replacement refuses until acknowledgement', async () => {
  const { workspace, controller, requests, first } = setup();
  workspace.act({ kind: 'edit', id: first, view: 'side' });
  expect(controller.context.closeEditor()).toBe(false);
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  expect(controller.flush()).toBe(false);
  expect(workspace.ui.getSnapshot().editor?.id).toBe(first);
  requests[0]?.finish(false);
  await vi.waitFor(() => expect(controller.flush()).toBe(true));
  expect(workspace.ui.getSnapshot().editor?.id).toBe(first);
  controller.context.closeEditor();
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  requests[1]?.finish(true);
  await vi.waitFor(() => expect(workspace.ui.getSnapshot().editor).toBeNull());
  workspace.dispose();
});

test('a newer open cancels a pending close and preserves the requested destination', async () => {
  const { workspace, controller, requests, first, other } = setup();
  workspace.act({ kind: 'edit', id: first, view: 'side' });
  controller.context.closeEditor(); await vi.waitFor(() => expect(requests).toHaveLength(1));
  controller.context.openEditor(other, true);
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[0]?.signal.aborted).toBe(true);
  requests[0]?.finish(true);
  expect(workspace.ui.getSnapshot().editor?.id).toBe(first);
  requests[1]?.finish(true);
  await vi.waitFor(() => expect(workspace.ui.getSnapshot().editor).toEqual({ id: other, view: 'full' }));
  workspace.dispose();
});

test('a source board replacement invalidates the pending continuation', async () => {
  const { workspace, controller, requests, first } = setup();
  workspace.act({ kind: 'edit', id: first, view: 'side' });
  controller.context.openEditor(first, true); await vi.waitFor(() => expect(requests).toHaveLength(1));
  expect(workspace.replaceBoard(emptyBoard(BoardIdSchema.parse('replacementboard'), 'Replacement'))).toBe(true);
  requests[0]?.finish(true);
  await vi.waitFor(() => expect(controller.flush()).toBe(true));
  expect(workspace.ui.getSnapshot().editor).toBeNull();
  workspace.dispose();
});


test('a blocked save refuses departure promptly and cannot navigate after Retry save', async () => {
  const waiters: { readonly finish: () => void }[] = [];
  const { workspace, controller, requests, first } = setup(() => new Promise<void>(resolve => { waiters.push({ finish: resolve }); }));
  workspace.act({ kind: 'edit', id: first, view: 'side' });
  const departure = controller.close();
  await vi.waitFor(() => expect(requests).toHaveLength(1)); requests[0]?.finish(true);
  await vi.waitFor(() => expect(waiters).toHaveLength(1));
  const result = workspace.submit([{ op: 'update', id: first, set: { text: 'Awaiting save' } }]);
  if (result.kind !== 'applied') throw new Error('Expected a pending save');
  const state = workspace.replication.state.getSnapshot();
  workspace.replication.failed(state.epoch, result.batchId, { kind: 'offline', message: 'Save fixture offline' });
  expect(await departure).toBe(false);
  expect(workspace.ui.getSnapshot().editor?.id).toBe(first);
  workspace.retry(); waiters[0]?.finish(); await Promise.resolve();
  expect(workspace.ui.getSnapshot().editor?.id).toBe(first);
  expect(controller.flush()).toBe(true);
  workspace.dispose();
});
