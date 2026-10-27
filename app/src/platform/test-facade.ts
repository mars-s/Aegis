import { CardIdSchema, CommandSchema } from "@aegis/domain";
import { decodeStoredBoard } from "@aegis/protocol/storage";
import type { Board, CardId } from "@aegis/domain";
import type { CanvasEngine } from "@aegis/scene";
import { benchmark } from "../canvas/benchmark.js";
import type { CreatedIds, WorkspaceConnection } from "@aegis/host-client";
import type { Workspace } from "../workspace/index.js";
import type { Connection } from "./connection.js";

export interface TestFacade {
  readonly workspace: Workspace;
  readonly canvas: {
    readonly board: Board;
    readonly view: { readonly x: number; readonly y: number; readonly z: number };
    readonly selected: ReadonlySet<CardId>;
    readonly setView: (view: { readonly x: number; readonly y: number; readonly z: number }) => void;
    readonly select: (ids: readonly string[]) => void;
    readonly frameIds: (ids: readonly string[], maximumZoom?: number) => void;
    readonly fit: () => void;
    readonly load: (board: unknown) => void;
    readonly setBoard: (board: unknown) => void;
    readonly inspect: CanvasEngine["inspect"];
    readonly engine: CanvasEngine;
  };
  readonly apply: (commands: unknown, done?: (created: CreatedIds) => void) => ReturnType<Workspace["submit"]>;
  readonly undo: Workspace["undo"];
  readonly redo: Workspace["redo"];
  readonly flush: () => Promise<void>;
  readonly benchmark: (count: number) => ReturnType<typeof benchmark>;
  readonly host: {
    readonly get: (path: string) => Promise<unknown>;
    readonly post: (path: string, body?: unknown) => Promise<unknown>;
  };
}

declare global { interface Window { aegis?: TestFacade } }

export function installTestFacade(args: {
  readonly workspace: Workspace;
  readonly engine: CanvasEngine;
  readonly connection: Connection;
  readonly replication: WorkspaceConnection;
  readonly persistCamera: () => void;
}): () => void {
  const { workspace, engine } = args;
  const ids = (values: readonly string[]): CardId[] => values.map(value => CardIdSchema.parse(value));
  const call = async (path: string, body?: unknown): Promise<unknown> => {
    const response = await fetch(args.connection.base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${args.connection.token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Test host request failed: ${response.status}`);
    const value: unknown = await response.json();
    return value;
  };
  const load = (value: unknown): void => { workspace.replaceBoard(decodeStoredBoard(value)); };
  const facade: TestFacade = {
    workspace,
    canvas: {
      get board() { return workspace.scene.snapshot(); },
      get view() { const camera = engine.camera(); return { x: camera.x, y: camera.y, z: camera.zoom }; },
      get selected() { return new Set(workspace.selection.getSnapshot()); },
      setView: view => { engine.navigate({ kind: "restore", camera: { x: view.x, y: view.y, zoom: view.z }, motion: "instant" }); args.persistCamera(); },
      select: values => workspace.act({ kind: "select", ids: ids(values) }),
      frameIds: values => { engine.navigate({ kind: "fit", ids: ids(values), motion: "instant" }); args.persistCamera(); },
      fit: () => { engine.navigate({ kind: "fit", ids: [], motion: "instant" }); args.persistCamera(); },
      load, setBoard: load,
      inspect: engine.inspect, engine,
    },
    apply: (value, done) => {
      const result = workspace.submit(CommandSchema.array().parse(value));
      if (result.kind === "applied") done?.(result.created);
      return result;
    },
    undo: workspace.undo,
    redo: workspace.redo,
    flush: args.replication.settled,
    benchmark: async count => { await args.replication.settled(); args.replication.dispose(); return benchmark(engine, workspace, count); },
    host: { get: path => call(path), post: (path, body) => call(path, body ?? {}) },
  };
  window.aegis = facade;
  return () => { if (window.aegis === facade) delete window.aegis; };
}
