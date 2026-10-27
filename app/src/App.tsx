import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BatchIdSchema, BoardIdSchema } from '@aegis/domain';
import type { BoardId, CardId, LinkId } from '@aegis/domain';
import { connectWorkspace, createHostClient, failureMessage } from '@aegis/host-client';
import type { HostClient, WorkspaceConnection } from '@aegis/host-client';
import type { CanvasEngine } from '@aegis/scene';
import { createWorkspace, useCard } from './workspace/index.js';
import type { Workspace } from './workspace/index.js';
import { Canvas } from './canvas/Canvas.js';
import { createComposition, defineComposition } from './composition.js';
import type { FeatureContext } from './composition.js';
import { Chrome, ToolbarPreferences, PanelPreferences } from './chrome/index.js';
import type { ChromeGestures } from './chrome/index.js';
import { Icon } from './chrome/controls.js';
import { createMenu } from './lib/ui/menu.js';
import { installNativeDownloads, printHtml, saveFile } from './lib/native-files.js';
import { DocumentProvider, DocumentContext, resolveDocumentDrop, installDocumentClipboard, disposeDocumentSessions } from './editors/document/index.js';
import type { DocumentServices } from './editors/document/index.js';
import { Plot } from './charts/index.js';
import { AgentShell } from './features/agents/react.js';
import type { AgentShellControls, AgentService, AgentFrameSchedule } from './features/agents/react.js';
import type { SettingsService } from './features/settings/service.js';
import { importDataset } from './cards/data/index.js';
import { locateConnection } from './platform/connection.js';
import type { Connection } from './platform/connection.js';
import { documentTestRewriter } from './platform/document-test.js';
import { installTestFacade } from './platform/test-facade.js';
import { installEditorActions } from './platform/editor-actions.js';
import { CreativeProvider } from './cards/creative/index.js';
import type { CreativeServices } from './cards/creative/index.js';
import { CreativeConnections, startCreativeConnection } from './features/draw/Connections.js';
import { wireframeActions } from './features/wireframe/registrations.js';
import { DrawingInspector } from './features/draw/Inspector.js';
import type { DrawSettings, DrawTarget } from './features/draw/Inspector.js';
import { readPreferences } from './features/draw/preferences.js';
import { WireframePanel } from './features/wireframe/WireframePanel.js';
import { BoardColours } from './features/colours/BoardColours.js';
import { AppearanceColours } from './features/colours/AppearanceColours.js';
import { DevicesPanel } from './features/media/DevicesPanel.js';
import { drawingTool } from './features/draw/tool.js';
import { beginPointEdit } from './features/draw/point-editor.js';
import { placementTool } from './features/wireframe/tool.js';
import { mediaPlacementTool } from './features/media/placement-tool.js';
import { Unsorted } from './platform/Unsorted.js';
import { CaptureButton, CaptureViews } from './features/editing/registration.js';
import { CreativeImports } from './platform/CreativeImports.js';
import { armDeckPlacement } from './platform/deck-placement.js';
import { createAvailableArea } from './platform/available-area.js';
import { createEditorController } from './platform/editor-controller.js';
import { useEditorPresence } from './platform/editor-presence.js';
import { createLibraryService, hostValue } from './platform/library-service.js';

declare const __AEGIS_TEST_FACADE__: boolean;

function EditorTitle({ workspace, id }: { readonly workspace: Workspace; readonly id: CardId }) {
  const card = useCard(workspace, id);
  return <span className="side-editor-name">{card?.text || 'Untitled'}</span>;
}
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
  const documentEditor = opened && context.workspace.record(opened.id).getSnapshot()?.type === 'doc';
  return <><button type="button" data-close aria-label={documentEditor ? 'Close document' : 'Back to board'} onClick={() => context.closeEditor()}><Icon name="left" /><span>Back to board</span></button><button type="button" aria-label={full ? 'Side panel' : 'Full width'} aria-pressed={full} aria-keyshortcuts="Control+Shift+F Meta+Shift+F" onClick={() => { if (opened) context.openEditor(opened.id, !full); }}><Icon name="window" /><span>{full ? 'Side panel' : 'Full width'}</span><kbd>F</kbd></button></>;
}

function BoardView({ runtime }: { readonly runtime: Runtime }) {
  const { workspace, client } = runtime;
  const [creativeMode, setCreativeMode] = useState<DrawTarget | 'wireframe' | null>(null);
  const connectionSelectionChanged = useCallback((id: LinkId | null) => { if (id) setCreativeMode(null); }, []);
  const drawSettings = useRef<DrawSettings>({ ...readPreferences(), shape: 'rect', fill: '#aed3ff', stroke: 'ink', sw: 2.5, sdash: 'solid', dl: 8, dg: 6, emoji: '⭐' });
  const importChoice = useRef<(() => void) | null>(null);
  const importAttached = useCallback((choose: (() => void) | null) => { importChoice.current = choose; }, []);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(timer); } }, [notice]);
  const [chromeEngine, setChromeEngine] = useState<CanvasEngine | null>(null);
  const [agentControls, setAgentControls] = useState<AgentShellControls | null>(null);
  const [facadeEngine, setFacadeEngine] = useState<CanvasEngine | null>(null);
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
  const composition = useMemo(() => {
    const base = createComposition({ assetUrl: client.assetUrl, menu: createMenu, registerSandbox: async (request, signal) => hostValue(await client.registerSandbox(request, signal)) });
    const draw = (kind: 'ink' | 'shape' | 'path' | 'stamp') => (context: FeatureContext): void => {
      const scene = context.engine(); if (!scene) return;
      workspace.act({ kind: 'select', ids: [] }); setCreativeMode({ kind: 'tool', tool: kind }); scene.tool(drawingTool(scene, workspace, kind, () => drawSettings.current, () => setCreativeMode(null)));
    };
    return defineComposition({ ...base, tools: [...base.tools.map(tool => tool.id === 'deck' ? { ...tool, run: armDeckPlacement } : tool),
      { id: 'draw-ink', label: 'Draw', shortcut: 'p', run: draw('ink') },
      { id: 'draw-shape', label: 'Shapes', shortcut: 's', run: draw('shape') },
      { id: 'vector', label: 'Vector pen', shortcut: 'shift+p', run: draw('path') },
      { id: 'draw-stamp', label: 'Emoji stamps', shortcut: 'e', run: draw('stamp') },
      { id: 'wireframe', label: 'Wireframe', shortcut: 'w', run: () => setCreativeMode('wireframe') },
      { id: 'import-image', label: 'Import', shortcut: 'mod+i', run: () => importChoice.current?.() },
      ...(['swatch', 'link', 'audio', 'video'] as const).map(type => ({ id: type, label: type === 'swatch' ? 'Colour swatch' : type === 'link' ? 'Link' : type === 'audio' ? 'Audio recording' : 'Video recording', run: (context: FeatureContext) => { const scene = context.engine(); if (scene) scene.tool(mediaPlacementTool(scene, workspace, type)); } })),
    ], menus: [...base.menus, ...wireframeActions(() => setCreativeMode('wireframe'))], panels: [...base.panels,
      { id: 'board-colours', label: 'Board colours', side: 'left', Body: BoardColours },
      { id: 'draw', label: 'Drawing', side: 'left', Body: ({ context }) => <div className="creative-panel-tools">{(['ink', 'shape', 'path', 'stamp'] as const).map(kind => <button type="button" key={kind} onClick={() => draw(kind)(context)}>{kind === 'ink' ? 'Draw ink' : kind === 'shape' ? 'Shapes' : kind === 'path' ? 'Vector pen' : 'Emoji stamps'}</button>)}</div> },
      { id: 'media-devices', label: 'Media devices', side: 'left', Body: DevicesPanel },
      { id: 'wireframe', label: 'Wireframe', side: 'left', Body: () => <button type="button" onClick={() => setCreativeMode('wireframe')}>Open wireframe tools</button> },
      { id: 'unsorted', label: 'Unsorted', side: 'left', Body: Unsorted },
    ] });
  }, [client, workspace]);
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
  const { presence: editorPresence, element: editorElement } = useEditorPresence(ui.editor, chromeEngine, controller.instant);
  const presentedEditor = editorPresence.kind === 'closed' ? null : editorPresence.editor;
  const attached = useCallback((instance: CanvasEngine | null): void => {
    engineCleanup.current?.(); engineCleanup.current = null;
    engine.current = instance; setChromeEngine(instance);
    if (!instance) return;
    const offArea = area.attach(instance);
    const offFit = instance.registerFrameParticipant({ fitBounds: zoom => controls.current?.scene.fitBounds(zoom).map(rect => ({ x: rect.x, y: rect.y, width: rect.w, height: rect.h })) ?? [] });
    engineCleanup.current = () => { offArea(); offFit(); };
  }, [area, workspace, runtime, persistCamera, controller]);
  useEffect(() => {
    if ((import.meta.env.DEV || __AEGIS_TEST_FACADE__) && chromeEngine && agentControls) setFacadeEngine(chromeEngine);
  }, [chromeEngine, agentControls]);
  useEffect(() => {
    if (!chromeEngine || facadeEngine !== chromeEngine || !(import.meta.env.DEV || __AEGIS_TEST_FACADE__)) return;
    return installTestFacade({ workspace, engine: chromeEngine, connection: runtime.connection, replication: runtime.replication, persistCamera, assetUrl: client.assetUrl, upload: async file => hostValue(await client.upload(file, lifetime.signal)), notify: setNotice, flushEditor: controller.flush });
  }, [chromeEngine, facadeEngine, workspace, runtime, client, lifetime, persistCamera, controller]);
  useEffect(() => { library.start(); return library.dispose; }, [library]);
  useLayoutEffect(() => {
    const stopController = controller.install(), stopActions = installEditorActions(context);
    return () => { stopActions(); stopController(); };
  }, [controller, context]);
  useEffect(() => installDocumentClipboard(workspace), [workspace]);
  useEffect(() => { const notice = (event: Event): void => { if (event instanceof CustomEvent && typeof event.detail === 'string') setNotice(event.detail); }; window.addEventListener('aegis:notice', notice); return () => window.removeEventListener('aegis:notice', notice); }, []);
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
  }, connect: id => startCreativeConnection(workspace, id) } : undefined, [chromeEngine, workspace]);
  const importCsv = useCallback(async (file: File, boardId: BoardId, at?: { readonly x: number; readonly y: number }): Promise<void> => {
    const target = createWorkspace({ board: hostValue(await client.board(boardId, lifetime.signal)) });
    try {
      const camera = engine.current?.camera() ?? { x: 0, y: 0, zoom: 1 };
      const result = await importDataset({ workspace: target, file, signal: lifetime.signal, at: at ?? { x: (innerWidth / 2 - camera.x) / camera.zoom - 320, y: (innerHeight / 2 - camera.y) / camera.zoom - 210 }, services: { upload: async (upload, signal) => hostValue(await client.upload(upload, signal)) } });
      if (result.kind === 'error') throw new Error(result.message);
      if (result.kind === 'cancelled') return;
      for (const batch of target.replication.state.getSnapshot().pending) hostValue(await client.commit(batch, lifetime.signal));
      if (workspace.metadata.getSnapshot().id === boardId) { runtime.replication.resynchronise(); await runtime.replication.settled(); }
      setNotice(`Imported ${file.name}${workspace.metadata.getSnapshot().id === boardId ? '' : ' into the original board'}.`);
    } finally { target.dispose(); }
  }, [client, lifetime, workspace, runtime.replication]);
  const creativeServices = useMemo<CreativeServices>(() => ({
    assetUrl: url => client.assetUrl(url ?? ''), upload: async (file, progress) => hostValue(await client.upload(file, lifetime.signal, progress)),
    linkPreview: async (url, signal) => hostValue(await client.linkPreview(url, signal)), openUrl, notify: setNotice, importCSV: importCsv,
    commitToBoard: async (boardId, commands) => {
      const result = hostValue(await client.commit({ boardId, id: BatchIdSchema.parse(crypto.randomUUID()), commands }, lifetime.signal));
      if (!result.ok) throw new Error(result.errors[0]?.reason ?? 'Could not save to the original board.');
    },
  }), [client, lifetime, importCsv]);
  const selection = useSyncExternalStore(workspace.selection.subscribe, workspace.selection.getSnapshot);
  const selectedId = selection.length === 1 ? selection[0] : undefined;
  const selectedCard = selectedId ? workspace.record(selectedId).getSnapshot() : null;
  const drawTarget: DrawTarget | null = selectedCard && ['ink', 'shape', 'path', 'stamp'].includes(selectedCard.type) ? { kind: 'card', id: selectedCard.id } : creativeMode && creativeMode !== 'wireframe' ? creativeMode : null;
  const documentServices = useMemo<DocumentServices>(() => ({ context, assetUrl: client.assetUrl,
    rewrite: async (request, signal) => {
      const test = __AEGIS_TEST_FACADE__ ? documentTestRewriter() : null; if (test) return test(request);
      const model = controls.current?.runtime.getSnapshot().model;
      return hostValue(await client.rewrite({ text: request.text, how: request.how, title: request.title, around: request.around, ...(model ? { model } : {}) }, signal));
    },
    printHtml, ...(runtime.connection.native ? { saveFile: async (blob: Blob, name: string) => { await saveFile(blob, name); } } : {}),
    openUrl: url => { void openUrl(url); },
    ReferenceChart: ({ card, cards }) => <Plot data={card.data} title={card.text} cards={cards} />,
    editorActions: <EditorActions context={context} full={ui.editor?.view === 'full'} />,
  }), [context, client, runtime.connection.native, ui.editor?.view]);
  const activeCard = presentedEditor ? workspace.record(presentedEditor.id).getSnapshot() : null;
  const editorKind = activeCard?.type === 'object' ? `object:${activeCard.kind}` : activeCard?.type;
  const Editor = composition.editors.find(item => item.kind === editorKind)?.Body;
  useEffect(() => {
    document.body.classList.toggle('editor-open', !!ui.editor);
    document.body.classList.toggle('editor-wide', ui.editor?.view === 'full');
    document.body.classList.toggle('docs-open', !!ui.editor && editorKind === 'doc');
    document.body.classList.toggle('docs-full', editorKind === 'doc' && ui.editor?.view === 'full');
    return () => document.body.classList.remove('editor-open', 'editor-wide', 'docs-open', 'docs-full');
  }, [editorKind, ui.editor?.view]);
  return <CreativeProvider services={creativeServices} workspace={workspace}><DocumentProvider services={documentServices}>
    <CreativeImports context={context} attached={importAttached} />
    <CaptureViews context={context} />
    {chromeEngine ? <CreativeConnections context={context} onSelectionChange={connectionSelectionChanged} /> : null}
    <Canvas workspace={workspace} composition={composition} attached={attached} cameraChanged={persistCamera} availableArea={area.source} resolveCardDrop={request => resolveDocumentDrop({ workspace, ...request })} />
    {chromeEngine ? <Chrome context={context} engine={chromeEngine} composition={composition} library={library.service} {...(gestures ? { gestures } : {})} settings={() => controls.current?.settings()} customiseToolbar={() => controls.current?.settings('toolbar')} ask={ids => { workspace.act({ kind: 'select', ids }); controls.current?.runtime.pin(ids); controls.current?.openAsk(); }} cameraChanged={persistCamera} barContent={<><CaptureButton />{agentControls?.follow}</>} rightContent={agentControls?.activity} /> : null}
    {schedule ? <AgentShell context={context} service={agentService} settingsService={settingsService} schedule={schedule} importCsv={importCsv} attached={setAgentControls} activityInChrome settingsSlots={{ toolbar: <ToolbarPreferences composition={composition} />, panels: <PanelPreferences composition={composition} />, board: <BoardColours context={context} />, appearance: <><AppearanceColours mode={document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'} board={workspace.scene.snapshot} invalidate={() => engine.current?.invalidate()} /><DevicesPanel /></> }} /> : null}
    {drawTarget && chromeEngine ? <DrawingInspector key={drawTarget.kind === 'tool' ? drawTarget.tool : drawTarget.id} context={context} target={drawTarget} onSettings={settings => { drawSettings.current = settings; }} onArm={(request, settings) => { drawSettings.current = settings; if (request.kind === 'edit-points') { beginPointEdit(workspace, chromeEngine, request.id); return; } setCreativeMode({ kind: 'tool', tool: request.kind }); chromeEngine.tool(drawingTool(chromeEngine, workspace, request.kind, () => drawSettings.current, () => setCreativeMode(null))); }} onFinish={() => { chromeEngine.tool(null); setCreativeMode(null); workspace.act({ kind: 'select', ids: [] }); }} /> : null}
    {creativeMode === 'wireframe' && chromeEngine ? <WireframePanel context={context} onPlace={request => chromeEngine.tool(placementTool(chromeEngine, workspace, request))} onClose={() => { chromeEngine.tool(null); setCreativeMode(null); }} /> : null}
    {Editor && presentedEditor && chromeEngine ? <aside ref={editorElement} inert={editorPresence.kind === 'closing'} data-scene-interactive className={`react-editor side-editor${editorPresence.kind === 'open' ? ' is-open' : editorPresence.kind === 'closing' ? ' is-closing' : ''}${editorPresence.kind !== 'closed' && editorPresence.instant ? ' instant' : ''}${editorKind === 'deck' ? ' deck-panel' : ''}${presentedEditor.view === 'full' ? ' full' : ''}`} aria-label="Card editor">
      {editorKind !== 'doc' ? <header className="react-editor-toolbar"><EditorTitle workspace={workspace} id={presentedEditor.id} /><EditorActions context={context} full={presentedEditor.view === 'full'} /></header> : null}
      <div className="react-editor-content"><Editor cardId={presentedEditor.id} workspace={workspace} engine={chromeEngine} /></div>
    </aside> : null}
    {ui.editor ? <DocumentContext context={context} sourceId={ui.editor.id} /> : null}
    {pendingDeletion ? <div className="library-undo" role="status"><span>Deleted "{pendingDeletion.name}"</span><button type="button" data-library-undo onClick={() => { void library.undo().catch(cause => setNotice(cause instanceof Error ? cause.message : 'Could not undo deletion.')); }}>Undo</button></div> : null}
    <div id="toast" hidden={!notice} className={notice ? 'toast react-toast' : undefined} role="status">{notice}{notice ? <button type="button" onClick={() => setNotice(null)}>Dismiss</button> : null}</div>
  </DocumentProvider></CreativeProvider>;
}

export default function App() {
  const retainedSelection = useRef<{ readonly boardId: BoardId; readonly ids: readonly CardId[] } | null>(null);
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
        if (retainedSelection.current?.boardId === loaded.value.id) workspace.act({ kind: 'select', ids: retainedSelection.current.ids.filter(id => loaded.value.cards.some(card => card.id === id)) });
        const replication = connectWorkspace({ workspace, client, onError: failure => { if (!lifetime.signal.aborted && failure.kind !== "cancelled") setError(failureMessage(failure)); } });
        active = { workspace, client, replication, connection };
        setRuntime(active);
      } catch (cause) {
        if (!lifetime.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not open the board.");
      }
    })();
    const dispose = (): void => {
      if (active) retainedSelection.current = { boardId: active.workspace.metadata.getSnapshot().id, ids: [...active.workspace.selection.getSnapshot()] };
      lifetime.abort(); active?.replication.dispose(); active?.workspace.dispose(); client?.dispose();
    };
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
  return <main className="react-app">{runtime ? <BoardView runtime={runtime} /> : <p className="react-connection" role="status">{error ?? "Opening your board"}</p>}{runtime && error ? <div className="react-import-error" role="alert">{error}<button onClick={() => setError(null)}>Dismiss</button></div> : null}</main>;
}
