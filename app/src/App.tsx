import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BoardIdSchema } from '@aegis/domain';
import type { BoardId } from '@aegis/domain';
import { connectWorkspace, createHostClient, failureMessage } from '@aegis/host-client';
import type { HostClient, WorkspaceConnection } from '@aegis/host-client';
import type { CanvasEngine } from '@aegis/scene';
import { createWorkspace } from './workspace/index.js';
import type { Workspace } from './workspace/index.js';
import { Canvas } from './canvas/Canvas.js';
import { createComposition } from './composition.js';
import type { FeatureContext } from './composition.js';
import { Chrome } from './chrome/index.js';
import type { ChromeGestures } from './chrome/index.js';
import { Icon } from './chrome/controls.js';
import { createMenu } from './lib/ui/menu.js';
import { installNativeDownloads, printHtml, saveFile } from './lib/native-files.js';
import { DocumentProvider, DocumentContext, installDocumentClipboard, disposeDocumentSessions } from './editors/document/index.js';
import type { DocumentServices } from './editors/document/index.js';
import { Plot } from './charts/index.js';
import { AgentShell } from './features/agents/react.js';
import type { AgentShellControls, AgentService, AgentFrameSchedule } from './features/agents/react.js';
import type { SettingsService } from './features/settings/service.js';
import { importDataset } from './cards/data/index.js';
import { locateConnection } from './platform/connection.js';
import type { Connection } from './platform/connection.js';
import { installTestFacade } from './platform/test-facade.js';
import { installEditorActions } from './platform/editor-actions.js';
import { installDataImport } from './platform/data-import.js';
import { createAvailableArea } from './platform/available-area.js';
import { createEditorController } from './platform/editor-controller.js';
import { createLibraryService, hostValue } from './platform/library-service.js';

declare const __AEGIS_TEST_FACADE__: boolean;
interface Runtime { readonly workspace: Workspace; readonly client: HostClient; readonly replication: WorkspaceConnection; readonly connection: Connection }

async function openUrl(url: string): Promise<void> {
  if (window.__TAURI_INTERNALS__) await window.__TAURI_INTERNALS__.invoke('open_url', { url });
  else window.open(url, '_blank', 'noopener,noreferrer');
}
async function copy(text: string): Promise<void> {
  if (window.__TAURI_INTERNALS__) await window.__TAURI_INTERNALS__.invoke('copy_text', { text });
  else await navigator.clipboard.writeText(text);
}
function EditorActions({ context, full }: { readonly context: FeatureContext; readonly full: boolean }) {
  const opened = context.workspace.ui.getSnapshot().editor;
  return <><button type="button" data-close aria-label="Back to board" onClick={() => context.closeEditor()}><Icon name="left" /><span>Back to board</span></button><button type="button" aria-label={full ? 'Side panel' : 'Full width'} aria-pressed={full} aria-keyshortcuts="Control+Shift+F Meta+Shift+F" onClick={() => { if (opened) context.openEditor(opened.id, !full); }}><Icon name="window" /><span>{full ? 'Side panel' : 'Full width'}</span><kbd>F</kbd></button></>;
}

function BoardView({ runtime }: { readonly runtime: Runtime }) {
  const { workspace, client } = runtime;
  const [notice, setNotice] = useState<string | null>(null);
  const [chromeEngine, setChromeEngine] = useState<CanvasEngine | null>(null);
  const [agentControls, setAgentControls] = useState<AgentShellControls | null>(null);
  const controls = useRef(agentControls); controls.current = agentControls;
  const engine = useRef<CanvasEngine | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engineCleanup = useRef<(() => void) | null>(null);
  const controllerRef = useRef<ReturnType<typeof createEditorController> | null>(null);
  const boardRead = useRef<AbortController | null>(null);
  const lifetime = useMemo(() => new AbortController(), [runtime]);
  const area = useMemo(createAvailableArea, [workspace]);
  const persistCamera = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const camera = engine.current?.camera();
      if (camera) void client.saveCamera(workspace.metadata.getSnapshot().id, { x: camera.x, y: camera.y, z: camera.zoom }, lifetime.signal);
    }, 500);
  }, [client, workspace, lifetime]);
  const composition = useMemo(() => createComposition({ assetUrl: client.assetUrl, menu: createMenu, registerSandbox: async (request, signal) => hostValue(await client.registerSandbox(request, signal)) }), [client]);
  const controller = useMemo(() => createEditorController({ workspace, engine: () => engine.current, composition, cameraChanged: persistCamera }), [workspace, composition, persistCamera]);
  controllerRef.current = controller;
  const context = controller.context;
  const openBoard = useCallback(async (id: BoardId): Promise<boolean> => {
    if (!controllerRef.current?.context.closeEditor() || !disposeDocumentSessions(workspace)) return false;
    boardRead.current?.abort(); const own = new AbortController(); boardRead.current = own;
    const signal = AbortSignal.any([own.signal, lifetime.signal]);
    try {
      await runtime.replication.settled();
      if (signal.aborted || workspace.saving.getSnapshot().kind === 'blocked') return false;
      const current = workspace.metadata.getSnapshot().id, camera = engine.current?.camera();
      if (camera) hostValue(await client.saveCamera(current, { x: camera.x, y: camera.y, z: camera.zoom }, signal));
      const board = hostValue(await client.board(id, signal));
      if (signal.aborted || !workspace.replaceBoard(board)) return false;
      localStorage.setItem('aegis:board', id); return true;
    } catch (cause) { if (!signal.aborted) setNotice(cause instanceof Error ? cause.message : 'Could not open this board.'); return false; }
  }, [client, workspace, runtime, lifetime]);
  const library = useMemo(() => createLibraryService({ workspace, client, replication: runtime.replication, open: openBoard, notify: setNotice, storage: localStorage }), [workspace, client, runtime.replication, openBoard]);
  const pendingDeletion = useSyncExternalStore(library.pending.subscribe, library.pending.getSnapshot);
  const ui = useSyncExternalStore(workspace.ui.subscribe, workspace.ui.getSnapshot);
  const attached = useCallback((instance: CanvasEngine | null): void => {
    engineCleanup.current?.(); engineCleanup.current = null;
    engine.current = instance; setChromeEngine(instance);
    if (!instance) return;
    const offArea = area.attach(instance);
    const offFit = instance.registerFrameParticipant({ fitBounds: zoom => controls.current?.scene.fitBounds(zoom).map(rect => ({ x: rect.x, y: rect.y, width: rect.w, height: rect.h })) ?? [] });
    const offFacade = import.meta.env.DEV || __AEGIS_TEST_FACADE__ ? installTestFacade({ workspace, engine: instance, connection: runtime.connection, replication: runtime.replication, persistCamera, flushEditor: controller.flush }) : null;
    engineCleanup.current = () => { offArea(); offFit(); offFacade?.(); };
  }, [area, workspace, runtime, persistCamera, controller]);
  useEffect(() => { library.start(); return library.dispose; }, [library]);
  useEffect(() => controller.install(), [controller]);
  useEffect(() => installEditorActions(context), [context]);
  useEffect(() => installDocumentClipboard(workspace), [workspace]);
  useEffect(() => installDataImport({ context, client, error: setNotice }), [context, client]);
  useEffect(() => { installNativeDownloads(setNotice); }, []);
  useEffect(() => { area.invalidate(); }, [area, ui.editor, ui.leftPanel, ui.rightPanel, agentControls]);
  useEffect(() => {
    const undo = (event: KeyboardEvent): void => {
      if (library.pending.getSnapshot() && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !(event.target instanceof Element && event.target.closest('input,textarea,[contenteditable]'))) {
        event.preventDefault(); event.stopImmediatePropagation(); void library.undo().catch(cause => setNotice(cause instanceof Error ? cause.message : 'Could not undo deletion.'));
      }
    };
    window.addEventListener('keydown', undo, true); return () => window.removeEventListener('keydown', undo, true);
  }, [library]);
  useEffect(() => () => { lifetime.abort(); boardRead.current?.abort(); engineCleanup.current?.(); if (saveTimer.current) clearTimeout(saveTimer.current); }, [lifetime]);
  const agentService = useMemo<AgentService>(() => ({
    list: async (id, signal) => hostValue(await client.agents.list(id, signal)), models: async signal => hostValue(await client.agents.models(signal)),
    connected: async (provider, signal) => hostValue(await client.agents.connected(provider, signal)),
    start: async (request, signal) => hostValue(await client.agents.start(request, signal)), message: async (id, text, ids, signal) => hostValue(await client.agents.message(id, text, ids, signal)),
    stop: async (id, signal) => hostValue(await client.agents.stop(id, signal)), undoRequest: async (id, request, signal) => hostValue(await client.agents.undoRequest(id, request, signal)),
  }), [client]);
  const settingsService = useMemo<SettingsService>(() => ({ accounts: async signal => hostValue(await client.accounts(signal)), authenticate: async (provider, action, signal) => { hostValue(await client.authenticate(provider, action, signal)); }, answer: async (provider, answer, signal) => hostValue(await client.answer(provider, answer, signal)), mcp: async signal => hostValue(await client.mcp(signal)), copy, openUrl }), [client]);
  const schedule = useMemo<AgentFrameSchedule | null>(() => chromeEngine ? { register: chromeEngine.registerFrameParticipant, invalidate: chromeEngine.invalidate, availableArea: () => { const free = chromeEngine.availableArea(); return { x: free.x, y: free.y, w: free.width, h: free.height }; } } : null, [chromeEngine]);
  const gestures = useMemo<ChromeGestures | undefined>(() => chromeEngine ? { start: intent => {
    intent.event.preventDefault(); intent.event.stopPropagation();
    const stage = document.getElementById('stage'); if (!stage) return;
    const rect = stage.getBoundingClientRect();
    chromeEngine.startTransform({ kind: intent.kind, ids: intent.ids, pointer: { id: intent.event.pointerId, point: { x: intent.event.clientX - rect.left, y: intent.event.clientY - rect.top } }, shift: intent.event.shiftKey });
  }, connect: chromeEngine.startConnection } : undefined, [chromeEngine]);
  const importCsv = useCallback(async (file: File, boardId: BoardId): Promise<void> => {
    const target = createWorkspace({ board: hostValue(await client.board(boardId, lifetime.signal)) });
    try {
      const camera = engine.current?.camera() ?? { x: 0, y: 0, zoom: 1 };
      const result = await importDataset({ workspace: target, file, signal: lifetime.signal, at: { x: (innerWidth / 2 - camera.x) / camera.zoom - 320, y: (innerHeight / 2 - camera.y) / camera.zoom - 210 }, services: { upload: async (upload, signal) => hostValue(await client.upload(upload, signal)) } });
      if (result.kind === 'error') throw new Error(result.message);
      if (result.kind === 'cancelled') return;
      for (const batch of target.replication.state.getSnapshot().pending) hostValue(await client.commit(batch, lifetime.signal));
      if (workspace.metadata.getSnapshot().id === boardId) { runtime.replication.resynchronise(); await runtime.replication.settled(); }
    } finally { target.dispose(); }
  }, [client, lifetime, workspace, runtime.replication]);
  const documentServices = useMemo<DocumentServices>(() => ({ context, assetUrl: client.assetUrl,
    rewrite: async (request, signal) => {
      const model = controls.current?.runtime.getSnapshot().model;
      return hostValue(await client.rewrite({ text: request.text, how: request.how, title: request.title, around: request.around, ...(model ? { model } : {}) }, signal));
    },
    printHtml, ...(runtime.connection.native ? { saveFile: async (blob: Blob, name: string) => { await saveFile(blob, name); } } : {}),
    openUrl: url => { void openUrl(url); },
    ReferenceChart: ({ card, cards }) => <Plot data={card.data} title={card.text} cards={cards} />,
    editorActions: <EditorActions context={context} full={ui.editor?.view === 'full'} />,
  }), [context, client, runtime.connection.native, ui.editor?.view]);
  const shortcuts = useMemo(() => [{ id: 'note', label: 'Note', text: 'N' }, { id: 'doc', label: 'Document', text: 'D' }, { id: 'deck', label: 'Slides', text: 'B' }, { id: 'ask', label: 'Ask', text: 'Command K or /' }, { id: 'fit', label: 'Fit board', text: '0' }, { id: 'side', label: 'Library and Windows', text: '\\' }], []);
  const activeCard = ui.editor ? workspace.record(ui.editor.id).getSnapshot() : null;
  const editorKind = activeCard?.type === 'object' ? `object:${activeCard.kind}` : activeCard?.type;
  const Editor = composition.editors.find(item => item.kind === editorKind)?.Body;
  return <DocumentProvider services={documentServices}>
    <Canvas workspace={workspace} composition={composition} attached={attached} cameraChanged={persistCamera} availableArea={area.source} />
    {chromeEngine ? <Chrome context={context} engine={chromeEngine} composition={composition} library={library.service} {...(gestures ? { gestures } : {})} settings={() => controls.current?.settings()} ask={ids => { workspace.act({ kind: 'select', ids }); controls.current?.openAsk(); }} cameraChanged={persistCamera} barContent={agentControls?.follow} rightContent={agentControls?.activity} /> : null}
    {schedule ? <AgentShell context={context} service={agentService} settingsService={settingsService} schedule={schedule} shortcuts={shortcuts} importCsv={importCsv} attached={setAgentControls} activityInChrome /> : null}
    {Editor && ui.editor && chromeEngine ? <aside className={`react-editor side-editor is-open${editorKind === 'doc' ? ' docs-panel' : editorKind === 'deck' ? ' deck-panel' : ''}${ui.editor.view === 'full' ? ' full' : ''}`} aria-label="Card editor">
      {editorKind !== 'doc' ? <header className="react-editor-toolbar"><span>{activeCard?.text || 'Untitled'}</span><EditorActions context={context} full={ui.editor.view === 'full'} /></header> : null}
      <div className="react-editor-content"><Editor cardId={ui.editor.id} workspace={workspace} engine={chromeEngine} /></div>
    </aside> : null}
    {ui.editor && editorKind === 'doc' ? <DocumentContext context={context} sourceId={ui.editor.id} /> : null}
    {pendingDeletion ? <div className="library-undo" role="status"><span>Deleted "{pendingDeletion.name}"</span><button type="button" data-library-undo onClick={() => { void library.undo().catch(cause => setNotice(cause instanceof Error ? cause.message : 'Could not undo deletion.')); }}>Undo</button></div> : null}
    {notice ? <div className="react-import-error" role="alert">{notice}<button type="button" onClick={() => setNotice(null)}>Dismiss</button></div> : null}
  </DocumentProvider>;
}

export default function App() {
  const [sessionVersion, setSessionVersion] = useState(0);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const lifetime = new AbortController();
    let active: Runtime | null = null;
    let client: HostClient | null = null;
    void (async () => {
      try {
        const connection = await locateConnection(lifetime.signal);
        if (lifetime.signal.aborted) return;
        if (!connection) { setError("Open Aegis to connect to your local boards."); return; }
        client = createHostClient({ baseUrl: connection.base, token: connection.token });
        const listed = await client.boards(lifetime.signal);
        if (lifetime.signal.aborted) return;
        if (listed.kind === "error") { setError(failureMessage(listed.error)); return; }
        document.documentElement.dataset.bridge = connection.native ? 'tauri' : 'browser';
        const savedId = BoardIdSchema.safeParse(localStorage.getItem('aegis:board'));
        const first = (savedId.success ? listed.value.find(board => board.id === savedId.data) : undefined) ?? listed.value[0];
        const loaded = first ? await client.board(first.id, lifetime.signal) : await client.createBoard("First board", lifetime.signal);
        if (lifetime.signal.aborted) return;
        if (loaded.kind === "error") { setError(failureMessage(loaded.error)); return; }
        const workspace = createWorkspace({ board: loaded.value });
        const replication = connectWorkspace({ workspace, client, onError: failure => { if (!lifetime.signal.aborted && failure.kind !== "cancelled") setError(failureMessage(failure)); } });
        active = { workspace, client, replication, connection };
        setRuntime(active);
      } catch (cause) {
        if (!lifetime.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not open the board.");
      }
    })();
    const dispose = (): void => { lifetime.abort(); active?.replication.dispose(); active?.workspace.dispose(); client?.dispose(); };
    const resume = (event: PageTransitionEvent): void => {
      if (!event.persisted) return;
      setRuntime(null);
      setError(null);
      setSessionVersion(version => version + 1);
    };
    window.addEventListener("pageshow", resume);
    window.addEventListener("beforeunload", dispose, { once: true });
    window.addEventListener("pagehide", dispose, { once: true });
    return () => { window.removeEventListener("pageshow", resume); window.removeEventListener("beforeunload", dispose); window.removeEventListener("pagehide", dispose); dispose(); };
  }, [sessionVersion]);
  return <main className="react-app">{runtime ? <BoardView runtime={runtime} /> : <p className="react-connection" role="status">{error ?? "Opening your board"}</p>}{runtime && error ? <div id="toast" role="alert">{error}<button onClick={() => setError(null)}>Dismiss</button></div> : <div id="toast" />}</main>;
}
