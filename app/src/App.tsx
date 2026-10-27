import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { connectWorkspace, createHostClient, failureMessage } from "@aegis/host-client";
import type { HostClient, WorkspaceConnection } from "@aegis/host-client";
import type { CanvasEngine } from "@aegis/scene";
import { createWorkspace } from "./workspace/index.js";
import type { Workspace } from "./workspace/index.js";
import { Canvas } from "./canvas/Canvas.js";
import { createComposition } from "./composition.js";
import type { FeatureContext } from "./composition.js";
import { locateConnection } from "./platform/connection.js";
import type { Connection } from "./platform/connection.js";
import { installTestFacade } from "./platform/test-facade.js";
import { installEditorActions } from "./platform/editor-actions.js";
import { installDataImport } from "./platform/data-import.js";

declare const __AEGIS_TEST_FACADE__: boolean;

interface Runtime {
  readonly workspace: Workspace;
  readonly client: HostClient;
  readonly replication: WorkspaceConnection;
  readonly connection: Connection;
}

function BoardView({ runtime }: { readonly runtime: Runtime }) {
  const { workspace } = runtime;
  const [importError, setImportError] = useState<string | null>(null);
  const composition = useMemo(() => createComposition({ assetUrl: runtime.client.assetUrl }), [runtime.client]);
  const metadata = useSyncExternalStore(workspace.metadata.subscribe, workspace.metadata.getSnapshot);
  const saving = useSyncExternalStore(workspace.saving.subscribe, workspace.saving.getSnapshot);
  const ui = useSyncExternalStore(workspace.ui.subscribe, workspace.ui.getSnapshot);
  const history = useSyncExternalStore(workspace.history.subscribe, workspace.history.getSnapshot);
  const engine = useRef<CanvasEngine | null>(null);
  const cleanupFacade = useRef<(() => void) | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistCamera = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const camera = engine.current?.camera();
      if (camera) void runtime.client.saveCamera(workspace.scene.snapshot().id, { x: camera.x, y: camera.y, z: camera.zoom });
    }, 500);
  }, [runtime, workspace]);
  const attached = useCallback((instance: CanvasEngine | null) => {
    cleanupFacade.current?.();
    cleanupFacade.current = null;
    engine.current = instance;
    if (instance && (import.meta.env.DEV || __AEGIS_TEST_FACADE__)) {
      cleanupFacade.current = installTestFacade({ workspace, engine: instance, connection: runtime.connection, replication: runtime.replication, persistCamera });
    }
  }, [runtime, workspace, persistCamera]);
  useEffect(() => () => {
    cleanupFacade.current?.();
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);
  const context = useMemo<FeatureContext>(() => ({
    workspace, engine: () => engine.current,
    openEditor: (id, full) => {
      const card = workspace.record(id).getSnapshot();
      const key = card?.type === "object" ? `object:${card.kind}` : card?.type;
      if (!composition.editors.some(editor => editor.kind === key)) return false;
      const opened = workspace.ui.getSnapshot().editor;
      if (opened && opened.id !== id && !context.closeEditor()) return false;
      workspace.act({ kind: "edit", id, view: full ? "full" : "side" });
      return true;
    },
    closeEditor: () => {
      const opened = workspace.ui.getSnapshot().editor;
      if (!opened) return true;
      const card = workspace.record(opened.id).getSnapshot();
      const key = card?.type === "object" ? `object:${card.kind}` : card?.type;
      const editor = composition.editors.find(registration => registration.kind === key);
      if (editor && !editor.flush(context, opened.id)) return false;
      workspace.act({ kind: "edit-close" });
      return true;
    },
  }), [workspace, composition]);
  useEffect(() => installEditorActions(context), [context]);
  useEffect(() => installDataImport({ context, client: runtime.client, error: setImportError }), [context, runtime.client]);
  function add(type: "note" | "title"): void {
    const camera = engine.current?.camera() ?? { x: 0, y: 0, zoom: 1 };
    workspace.submit([{ op: "create", type, text: type === "title" ? "Untitled" : "", props: { contentFit: true }, x: (innerWidth / 2 - camera.x) / camera.zoom, y: (innerHeight / 2 - camera.y) / camera.zoom }]);
  }
  const activeCard = ui.editor ? workspace.record(ui.editor.id).getSnapshot() : null;
  const editorKind = activeCard?.type === "object" ? `object:${activeCard.kind}` : activeCard?.type;
  const Editor = composition.editors.find(item => item.kind === editorKind)?.Body;
  return <>
    {importError ? <div role="alert" className="react-import-error">{importError}<button onClick={() => setImportError(null)}>Dismiss</button></div> : null}
    <Canvas workspace={workspace} composition={composition} attached={attached} cameraChanged={persistCamera} />
    <div className="react-board-label">{metadata.name}</div>
    <nav className="react-tools" aria-label="Canvas tools">
      <button data-tool="note" onClick={() => add("note")}>Note</button>
      <button data-tool="title" onClick={() => add("title")}>Title</button>
      <button onClick={() => { engine.current?.navigate({ kind: "fit", ids: [], motion: "glide" }); persistCamera(); }}>Fit</button>
      <button disabled={!history.undo} onClick={() => workspace.undo()}>Undo</button>
      <button disabled={!history.redo} onClick={() => workspace.redo()}>Redo</button>
      {composition.tools.map(tool => <button key={tool.id} data-tool={tool.id} onClick={() => tool.run(context)}>{tool.label}</button>)}
      {composition.menus.length ? <details className="react-actions"><summary>Actions</summary>{composition.menus.map(item => <button key={item.id} onClick={() => item.run(context)}>{item.label}</button>)}</details> : null}
    </nav>
    <div className="react-save-state" role="status" data-saved data-save-state={saving.kind}>
      {saving.kind === "blocked" ? <><span>{saving.reason}</span><button onClick={workspace.retry}>Retry</button></> : saving.kind === "saving" ? "Saving" : "Saved"}
    </div>
    {ui.leftPanel ? composition.panels.filter(panel => panel.side === "left").map(panel => <panel.Body key={panel.id} context={context} />) : null}
    {ui.rightPanel ? composition.panels.filter(panel => panel.side === "right").map(panel => <panel.Body key={panel.id} context={context} />) : null}
    {Editor && ui.editor && engine.current ? <aside className={`react-editor side-editor${ui.editor.view === "full" ? " full" : ""}`} aria-label="Card editor"><header className="react-editor-toolbar"><button data-close onClick={context.closeEditor}>Close editor</button><button aria-label={ui.editor.view === "full" ? "Half width" : "Full width"} onClick={() => ui.editor && context.openEditor(ui.editor.id, ui.editor.view !== "full")}>{ui.editor.view === "full" ? "Half width" : "Full width"}</button></header><div className="react-editor-content"><Editor cardId={ui.editor.id} workspace={workspace} engine={engine.current} /></div></aside> : null}
  </>;
}

export default function App() {
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
        if (listed.kind === "error") { setError(failureMessage(listed.error)); return; }
        const first = listed.value[0];
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
    return () => { lifetime.abort(); active?.replication.dispose(); active?.workspace.dispose(); client?.dispose(); };
  }, []);
  return <main className="react-app">{runtime ? <BoardView runtime={runtime} /> : <p className="react-connection" role="status">{error ?? "Opening your board"}</p>}{runtime && error ? <div id="toast" role="alert">{error}<button onClick={() => setError(null)}>Dismiss</button></div> : <div id="toast" />}</main>;
}
