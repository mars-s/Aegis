import type { CardId } from '@aegis/domain/schema';
import type { Point } from './geometry.js';
import type { SceneTool, ToolCancel, ToolKey, ToolPointer, ToolPreview } from './types.js';

type ToolInput =
  | { readonly kind: 'down'; readonly tool: SceneTool; readonly point: ToolPointer; readonly hit: CardId | null }
  | { readonly kind: 'move'; readonly tool: SceneTool; readonly points: readonly ToolPointer[] }
  | { readonly kind: 'up'; readonly tool: SceneTool; readonly point: ToolPointer }
  | { readonly kind: 'key'; readonly tool: SceneTool; readonly key: ToolKey }
  | { readonly kind: 'cancel'; readonly tool: SceneTool; readonly reason: ToolCancel };

/** DOM adapters only queue data. The engine drains callbacks in its input phase. */
export class ToolController {
  private current: SceneTool | null = null;
  private pointer: number | null = null;
  private readonly inputs: ToolInput[] = [];
  private readonly cancelled = new WeakSet<SceneTool>();
  private drawing: ToolPreview | null = null;
  private readonly invalidate: () => void;
  private readonly hitTest: (point: Point) => CardId | null;
  constructor(invalidate: () => void, hitTest: (point: Point) => CardId | null) { this.invalidate = invalidate; this.hitTest = hitTest; }
  owns(pointer: number): boolean { return this.pointer === pointer; }
  set(tool: SceneTool | null): void {
    if (tool === this.current) return;
    this.cancel('tool-change'); this.current = tool;
    if (tool) this.cancelled.delete(tool);
    this.invalidate();
  }
  preview(value: ToolPreview | null): void { this.drawing = value; this.invalidate(); }
  getPreview(): ToolPreview | null { return this.drawing; }
  down(point: ToolPointer): boolean {
    const tool = this.current, hit = this.hitTest(point.screen);
    if (!tool || this.pointer !== null || !tool.accepts(point, hit)) return false;
    this.cancelled.delete(tool); this.pointer = point.pointerId;
    this.inputs.push({ kind: 'down', tool, point, hit }); this.invalidate(); return true;
  }
  move(points: readonly ToolPointer[]): boolean {
    const tool = this.current;
    if (!tool || !points.length) return false;
    this.inputs.push({ kind: 'move', tool, points }); this.invalidate(); return true;
  }
  up(point: ToolPointer): boolean {
    if (!this.current || this.pointer !== point.pointerId) return false;
    this.inputs.push({ kind: 'up', tool: this.current, point }); this.pointer = null; this.invalidate(); return true;
  }
  key(key: ToolKey): boolean {
    if (!this.current || !this.current.acceptsKey(key)) return false;
    this.inputs.push({ kind: 'key', tool: this.current, key }); this.invalidate(); return true;
  }
  cancel(reason: ToolCancel): void {
    if (this.current && !this.cancelled.has(this.current)) {
      this.inputs.push({ kind: 'cancel', tool: this.current, reason }); this.cancelled.add(this.current);
    }
    this.pointer = null; this.drawing = null; this.invalidate();
  }
  reset(reason: 'board-change' | 'dispose'): void {
    const affected = new Set(this.inputs.map(input => input.tool));
    if (this.current && !this.cancelled.has(this.current)) affected.add(this.current);
    this.inputs.length = 0;
    for (const tool of affected) { this.inputs.push({ kind: 'cancel', tool, reason }); this.cancelled.add(tool); }
    this.pointer = null; this.drawing = null; this.current = null; this.invalidate();
  }
  flush(): void {
    for (const input of this.inputs.splice(0)) switch (input.kind) {
      case 'down': input.tool.down(input.point, input.hit); break;
      case 'move': input.tool.move(input.points); break;
      case 'up': input.tool.up(input.point); break;
      case 'key': input.tool.key(input.key); break;
      case 'cancel': input.tool.cancel(input.reason); break;
      default: { const exhaustive: never = input; throw new Error(String(exhaustive)); }
    }
  }
  dispose(): void { this.reset('dispose'); this.flush(); }
}
