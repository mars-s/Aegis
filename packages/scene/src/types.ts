import type { Board, Card, CardId, ChangeSet, Command, LinkId, Source } from '@aegis/domain/schema';
import type { LinkRoute } from './links.js';
import type { CameraState, Point, Rect } from './geometry.js';
import type { ZoomTier } from './representations.js';

export type { Source } from '@aegis/domain/schema';
export type SceneOrigin = 'local' | 'agent' | 'sync';
export interface SceneChange extends ChangeSet {
  readonly kind: 'change' | 'replace';
  readonly origin: SceneOrigin;
}
export interface SceneSource {
  readonly snapshot: () => Board;
  readonly subscribe: (changed: (change: SceneChange) => void) => () => void;
}
/** Narrow structural port implemented by the app's Workspace. */
export interface CanvasWorkspace {
  readonly scene: SceneSource;
  readonly selection: Source<readonly CardId[]>;
  readonly submit: (commands: readonly Command[]) => unknown;
  readonly act: (intent: { readonly kind: 'select'; readonly ids: readonly CardId[] }) => void;
}
export interface SlotLease {
  readonly key: string;
  readonly cardId: CardId;
  readonly generation: number;
  readonly host: HTMLElement;
}
export interface LeaseSource extends Source<readonly SlotLease[]> {
  readonly acknowledgeUnmount: (key: string, generation: number) => void;
}
export type PinReason = 'focus' | 'ime' | 'dirty' | 'capture' | 'media';
export type Navigation =
  | { readonly kind: 'fit'; readonly ids: readonly CardId[]; readonly motion: 'instant' | 'glide' }
  | { readonly kind: 'restore'; readonly camera: CameraState; readonly motion: 'instant' | 'glide' };
export interface Representation {
  readonly id: CardId;
  readonly kind: ZoomTier;
  readonly bounds: Rect;
  readonly rotation: number;
  readonly text: string;
}
export type FramePhase = 'input' | 'camera' | 'cull' | 'reads' | 'writes';
export interface FrameSample {
  readonly start: number;
  readonly interval: number;
  readonly cpu: number;
  readonly phases: Readonly<Record<FramePhase, number>>;
  readonly inputToWrite: number | null;
  readonly candidates: number;
  readonly links: number;
  readonly leases: number;
}
export interface FrameDiagnostics {
  readonly pendingFrames: number;
  readonly frameCount: number;
  readonly visibleCards: number;
  readonly visibleLinks: number;
  readonly activeLeases: number;
  readonly pinnedLeases: number;
  readonly releasingLeases: number;
  readonly queuedMounts: number;
  readonly discardedMeasurements: number;
  readonly tier: ZoomTier;
  readonly camera: CameraState;
}
export interface FrameParticipant {
  readonly read: () => void;
  readonly write: () => void;
  readonly fitBounds?: (zoom: number) => readonly Rect[];
}
export interface ToolPointer {
  readonly pointerId: number;
  readonly pointerType: 'mouse' | 'pen' | 'touch';
  readonly screen: Point;
  readonly world: Point;
  readonly pressure: number;
  readonly time: number;
  readonly button: number;
  readonly buttons: number;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly bypass: boolean;
}
export type ToolCancel = 'escape' | 'pointer-cancel' | 'lost-capture' | 'board-change' | 'tool-change' | 'dispose';
export interface ToolKey { readonly key: string; readonly shift: boolean; readonly alt: boolean; readonly bypass: boolean }
export interface SceneTool {
  readonly accepts: (point: ToolPointer, hit: CardId | null) => boolean;
  readonly down: (point: ToolPointer, hit: CardId | null) => void;
  readonly move: (points: readonly ToolPointer[]) => void;
  readonly up: (point: ToolPointer) => void;
  readonly acceptsKey: (key: ToolKey) => boolean;
  readonly key: (key: ToolKey) => void;
  readonly cancel: (reason: ToolCancel) => void;
}
export interface PreviewStroke { readonly colour: string; readonly width: number; readonly dash: readonly number[] }
export type ToolPrimitive =
  | { readonly kind: 'path'; readonly space: 'world' | 'screen'; readonly d: string; readonly fill: string | null; readonly stroke: PreviewStroke | null }
  | { readonly kind: 'rect'; readonly space: 'world' | 'screen'; readonly bounds: Rect; readonly radius: number; readonly fill: string | null; readonly stroke: PreviewStroke | null }
  | { readonly kind: 'circle'; readonly space: 'world' | 'screen'; readonly centre: Point; readonly radius: number; readonly fill: string | null; readonly stroke: PreviewStroke | null };
export interface ToolPreview { readonly primitives: readonly ToolPrimitive[]; readonly cursor: 'crosshair' | 'none' | 'default' }
export interface CanvasEngine {
  readonly leases: LeaseSource;
  readonly navigate: (intent: Navigation) => void;
  readonly camera: () => CameraState;
  readonly screenToWorld: (point: Point) => Point;
  readonly representations: () => readonly Representation[];
  readonly hitTest: (point: Point) => CardId | null;
  readonly hitTestLink: (point: Point) => LinkId | null;
  readonly linkGeometry: () => readonly { readonly id: LinkId; readonly route: LinkRoute }[];
  readonly tool: (tool: SceneTool | null) => void;
  readonly preview: (preview: ToolPreview | null) => void;
  readonly afterInput: (run: () => void) => void;
  readonly startTransform: (intent: { readonly kind: 'resize' | 'rotate'; readonly ids: readonly CardId[]; readonly pointer: { readonly id: number; readonly point: Point }; readonly shift: boolean }) => void;
  readonly startConnection: (id: CardId) => void;
  readonly pin: (id: CardId, reason: PinReason, pinned: boolean) => void;
  readonly requestMeasurement: (key: string, generation: number) => void;
  readonly registerFrameParticipant: (participant: FrameParticipant) => () => void;
  readonly viewport: () => Rect;
  readonly availableArea: () => Rect;
  readonly invalidate: () => void;
  readonly inspect: () => FrameDiagnostics;
  readonly recordMetrics: (enabled: boolean) => void;
  readonly samples: () => readonly FrameSample[];
  readonly dispose: () => void;
}
export interface CanvasAttachment {
  readonly stage: HTMLElement;
  readonly world: HTMLElement;
  readonly backdrop: HTMLCanvasElement;
  readonly overlay: HTMLCanvasElement;
  readonly workspace: CanvasWorkspace;
  readonly warmLeases?: number;
  readonly reducedMotion?: boolean;
  readonly snapGrid?: number;
  readonly canLease?: (card: Card) => boolean;
  readonly availableArea?: Source<Rect>;
}
