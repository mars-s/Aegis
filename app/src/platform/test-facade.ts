import { flushSync } from "react-dom";
import { CardIdSchema, CommandSchema } from "@aegis/domain";
import { decodeStoredBoard } from "@aegis/protocol/storage";
import type { Board, CardId } from "@aegis/domain";
import type { CanvasEngine } from "@aegis/scene";
import { benchmark } from "../canvas/benchmark.js";
import { decodeHostError } from '@aegis/protocol/http';
import type { AssetUpload } from '@aegis/protocol/http';
import type { CreatedIds, WorkspaceConnection } from "@aegis/host-client";
import type { Workspace } from "../workspace/index.js";
import type { Connection } from "./connection.js";

export interface TestFacade {
  readonly workspace: Workspace;
  readonly canvas: {
    readonly board: Board;
    readonly view: { readonly x: number; readonly y: number; readonly z: number };
    readonly selected: ReadonlySet<CardId>;
    readonly selection: () => readonly CardId[];
    readonly availableArea: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
    readonly stats: () => { readonly mounted: number };
    readonly mountedEl: (id: string) => HTMLElement | null;
    readonly representationRect: (id: string) => DOMRect | null;
    readonly centre: () => { readonly x: number; readonly y: number };
    readonly screenToWorld: (x: number, y: number) => { readonly x: number; readonly y: number };
    readonly worldToScreen: (x: number, y: number) => { readonly x: number; readonly y: number };
    readonly busy: () => boolean;
    readonly tool: string | null;
    readonly setTool: (tool: null) => void;
    readonly glideTo: (view: Board['view'], duration?: number, done?: () => void) => void;
    readonly setView: (view: { readonly x: number; readonly y: number; readonly z: number }) => void;
    readonly select: (ids: readonly string[]) => void;
    readonly frameIds: (ids: readonly string[], maximumZoom?: number) => void;
    readonly ring: (ids: readonly string[], ...options: Parameters<CanvasEngine['ring']> extends [unknown, ...infer Rest] ? Rest : never) => void;
    readonly clearAgentLine: CanvasEngine['clearAgentLine'];
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
  readonly toast: (message: string) => void;
  readonly benchmark: (count: number) => ReturnType<typeof benchmark>;
  readonly editing: { readonly history: { readonly status: { readonly undo: boolean; readonly redo: boolean } } };
  readonly host: {
    readonly base: string;
    readonly upload: (file: File) => Promise<AssetUpload>;
    readonly assetUrl: (url: string) => string;
    readonly get: (path: string) => Promise<unknown>;
    readonly post: (path: string, body?: unknown) => Promise<unknown>;
  };
}

declare global { interface Window { aegis?: TestFacade; aegisCtx?: TestFacade } }

export function installTestFacade(args: {
  readonly workspace: Workspace;
  readonly engine: CanvasEngine;
  readonly connection: Connection;
  readonly replication: WorkspaceConnection;
  readonly persistCamera: () => void;
  readonly assetUrl: (url: string) => string;
  readonly upload: (file: File) => Promise<AssetUpload>;
  readonly notify: (message: string) => void;
  readonly flushEditor?: () => boolean;
}): () => void {
  const { workspace, engine } = args;
  const ids = (values: readonly string[]): CardId[] => values.map(value => CardIdSchema.parse(value));
  const call = async (path: string, body?: unknown): Promise<unknown> => {
    const response = await fetch(args.connection.base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${args.connection.token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value: unknown = await response.json();
    if (!response.ok) throw new Error(decodeHostError(value));
    return value;
  };
  const load = (value: unknown): void => {
    const board = decodeStoredBoard(value);
    flushSync(() => { if (args.flushEditor?.() === false || !workspace.replaceBoard(board)) throw new Error('Save pending edits before replacing the board.'); });
    localStorage.setItem('aegis:board', board.id);
  };
  const watches = new Set<() => void>();
  const mountedEl = (value: string): HTMLElement | null => engine.leases.getSnapshot().find(lease => lease.cardId === value)?.host.parentElement ?? null;
  const facade: TestFacade = {
    workspace,
    canvas: {
      get board() { return workspace.scene.snapshot(); },
      get view() { const camera = engine.camera(); return { x: camera.x, y: camera.y, z: camera.zoom }; },
      get selected() { return new Set(workspace.selection.getSnapshot()); },
      selection: () => [...workspace.selection.getSnapshot()],
      get availableArea() { const area = engine.availableArea(); return { x: area.x, y: area.y, w: area.width, h: area.height }; },
      stats: () => ({ mounted: engine.inspect().activeLeases }), mountedEl,
      representationRect: id => mountedEl(id)?.getBoundingClientRect() ?? null,
      centre: () => { const area = engine.viewport(); return engine.screenToWorld({ x: area.width / 2, y: area.height / 2 }); },
      screenToWorld: (x, y) => engine.screenToWorld({ x, y }),
      worldToScreen: (x, y) => { const camera = engine.camera(); return { x: x * camera.zoom + camera.x, y: y * camera.zoom + camera.y }; },
      busy: engine.busy,
      get tool() { return engine.toolName(); },
      setTool: tool => engine.tool(tool),
      glideTo: (view, duration = 420, done) => {
        engine.navigate({ kind: 'restore', camera: { x: view.x, y: view.y, zoom: view.z }, motion: 'glide', duration }); args.persistCamera();
        if (!done) return;
        let release: (() => void) | null = null;
        const complete = (): void => { release?.(); if (release) watches.delete(release); engine.afterInput(done); };
        if (!engine.busy()) complete();
        else { release = engine.registerFrameParticipant({ read: () => { if (!engine.busy()) complete(); } }); watches.add(release); }
      },
      setView: view => { engine.navigate({ kind: "restore", camera: { x: view.x, y: view.y, zoom: view.z }, motion: "instant" }); args.persistCamera(); },
      select: values => workspace.act({ kind: "select", ids: ids(values) }),
      frameIds: (values, maximumZoom = 1) => { engine.navigate({ kind: "fit", ids: ids(values), motion: "instant", maximumZoom }); args.persistCamera(); },
      ring: (values, ...options) => engine.ring(ids(values), ...options),
      clearAgentLine: engine.clearAgentLine,
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
    flush: async () => { if (args.flushEditor?.() === false) throw new Error('The editor has unresolved changes.'); await args.replication.settled(); },
    toast: args.notify,
    editing: { history: { get status() { return workspace.history.getSnapshot(); } } },
    benchmark: async count => { await args.replication.settled(); args.replication.dispose(); return benchmark(engine, workspace, count); },
    host: { base: args.connection.base, upload: args.upload, assetUrl: args.assetUrl, get: path => call(path), post: (path, body) => call(path, body ?? {}) },
  };
  window.aegis = facade;
  window.aegisCtx = facade;
  return () => { for (const release of watches) release(); watches.clear(); if (window.aegis === facade) delete window.aegis; if (window.aegisCtx === facade) delete window.aegisCtx; };
}
