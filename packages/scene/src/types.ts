import type { Board, Card, CardId, ChangeSet, Command, Source } from '@aegis/domain/schema';
import type { CameraState, Point, Rect } from './geometry.js';
import type { ZoomTier } from './representations.js';

export type { Source } from '@aegis/domain/schema';
export interface SceneChange extends ChangeSet {
  readonly kind: 'change' | 'replace';
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
export interface CanvasEngine {
  readonly leases: LeaseSource;
  readonly navigate: (intent: Navigation) => void;
  readonly camera: () => CameraState;
  readonly screenToWorld: (point: Point) => Point;
  readonly representations: () => readonly Representation[];
  readonly hitTest: (point: Point) => CardId | null;
  readonly pin: (id: CardId, reason: PinReason, pinned: boolean) => void;
  readonly requestMeasurement: (key: string, generation: number) => void;
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
}
