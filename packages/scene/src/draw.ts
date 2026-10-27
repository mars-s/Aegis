import type { CardId, Link } from '@aegis/domain/schema';
import type { CameraState, Point, Rect } from './geometry.js';
import type { LinkRoute } from './links.js';
import type { Representation, ToolPreview } from './types.js';

export interface DrawLink { readonly link: Link; readonly route: LinkRoute }

export class CanvasPainter {
  private readonly backdrop: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly grid: CanvasRenderingContext2D;
  private readonly ink: CanvasRenderingContext2D;
  private pattern: CanvasPattern | null = null;
  private patternKey = '';
  private width = 0;
  private height = 0;
  private dpr = 1;
  private readonly previewPaths = new Map<string, Path2D>();

  constructor(backdrop: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    const grid = backdrop.getContext('2d'), ink = overlay.getContext('2d');
    if (!grid || !ink) throw new Error('Scene requires two 2D canvas contexts');
    this.backdrop = backdrop; this.overlay = overlay; this.grid = grid; this.ink = ink;
  }

  paint(viewport: Rect, dpr: number, camera: CameraState, representations: readonly Representation[], links: readonly DrawLink[], mounted: (id: CardId) => boolean, selected: ReadonlySet<CardId>, marquee: Rect | null, preview: ToolPreview | null = null): void {
    this.resize(viewport, dpr);
    this.drawGrid(camera);
    const ctx = this.ink;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    ctx.lineWidth = 1; ctx.font = '12px Inter, sans-serif';
    for (const { link, route } of links) {
      const { p0, p2, control } = route;
      ctx.strokeStyle = link.colour || 'rgb(255 255 255 / .16)'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5;
      ctx.setLineDash(link.dash ? [5, 5] : []);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
      if (route.points.length) for (const point of route.points.slice(1)) ctx.lineTo(point.x, point.y);
      else ctx.quadraticCurveTo(control.x, control.y, p2.x, p2.y);
      ctx.stroke(); ctx.setLineDash([]);
      if (link.arrow === 'end' || link.arrow === 'both') this.arrow(p2, route.points.at(-2) ?? control);
      if (link.arrow === 'both') this.arrow(p0, route.points[1] ?? control);
      if (link.label && camera.zoom >= 0.12) {
        ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(link.label, route.label.x, route.label.y - 12 * Math.min(1, camera.zoom));
        ctx.fillStyle = '#b5b5bd'; ctx.fillText(link.label, route.label.x, route.label.y - 12 * Math.min(1, camera.zoom)); ctx.lineWidth = 1;
      }
    }
    for (const rep of representations) {
      const r = rep.bounds;
      if (rep.kind === 'far' && rep.rotation === 0) {
        ctx.fillStyle = '#252529'; ctx.fillRect(r.x, r.y, r.width, r.height);
        if (selected.has(rep.id)) { ctx.strokeStyle = '#c6c6ce'; ctx.strokeRect(r.x - 3, r.y - 3, r.width + 6, r.height + 6); }
        continue;
      }
      if (rep.kind !== 'detail' || !mounted(rep.id)) {
        ctx.save(); ctx.translate(r.x + r.width / 2, r.y + r.height / 2); ctx.rotate(rep.rotation * Math.PI / 180);
        ctx.fillStyle = '#151517'; ctx.strokeStyle = '#303035'; ctx.beginPath();
        if (rep.kind === 'far') ctx.rect(-r.width / 2, -r.height / 2, r.width, r.height);
        else ctx.roundRect(-r.width / 2, -r.height / 2, r.width, r.height, Math.min(8, r.height / 4));
        ctx.fill(); ctx.stroke();
        if (rep.kind !== 'far' && r.width >= 50 && r.height >= 25) {
          ctx.beginPath(); ctx.rect(-r.width / 2 + 8, -r.height / 2 + 4, Math.max(0, r.width - 16), Math.max(0, r.height - 8)); ctx.clip();
          ctx.fillStyle = '#dadade'; ctx.textAlign = 'left'; ctx.font = `${14 * camera.zoom}px Inter, sans-serif`;
          ctx.fillText(rep.text, -r.width / 2 + 16, -r.height / 2 + 28);
        }
        ctx.restore();
      }
      if (selected.has(rep.id)) {
        ctx.save(); ctx.translate(r.x + r.width / 2, r.y + r.height / 2); ctx.rotate(rep.rotation * Math.PI / 180);
        ctx.strokeStyle = '#c6c6ce'; ctx.lineWidth = 1.5; ctx.strokeRect(-r.width / 2 - 3, -r.height / 2 - 3, r.width + 6, r.height + 6); ctx.restore();
      }
    }
    if (marquee) { ctx.fillStyle = '#ffffff0c'; ctx.strokeStyle = '#85858f'; ctx.fillRect(marquee.x, marquee.y, marquee.width, marquee.height); ctx.strokeRect(marquee.x, marquee.y, marquee.width, marquee.height); }
    if (preview) for (const primitive of preview.primitives) {
      const scale = primitive.space === 'world' ? camera.zoom : 1;
      ctx.save();
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, primitive.space === 'world' ? camera.x * dpr : 0, primitive.space === 'world' ? camera.y * dpr : 0);
      let path: Path2D;
      switch (primitive.kind) {
        case 'path': {
          const cached = this.previewPaths.get(primitive.d);
          path = cached ?? new Path2D(primitive.d);
          if (!cached) { if (this.previewPaths.size >= 32) this.previewPaths.clear(); this.previewPaths.set(primitive.d, path); }
          break;
        }
        case 'rect': path = new Path2D(); path.roundRect(primitive.bounds.x, primitive.bounds.y, primitive.bounds.width, primitive.bounds.height, primitive.radius); break;
        case 'circle': path = new Path2D(); path.arc(primitive.centre.x, primitive.centre.y, primitive.radius, 0, Math.PI * 2); break;
        default: { const exhaustive: never = primitive; throw new Error(String(exhaustive)); }
      }
      if (primitive.fill) { ctx.fillStyle = primitive.fill; ctx.fill(path); }
      if (primitive.stroke) { ctx.strokeStyle = primitive.stroke.colour; ctx.lineWidth = primitive.stroke.width / scale; ctx.setLineDash(primitive.stroke.dash.map(value => value / scale)); ctx.stroke(path); }
      ctx.restore();
    }
  }

  private resize(viewport: Rect, dpr: number): void {
    if (this.width === viewport.width && this.height === viewport.height && this.dpr === dpr) return;
    this.width = viewport.width; this.height = viewport.height; this.dpr = dpr;
    for (const canvas of [this.backdrop, this.overlay]) {
      canvas.width = Math.max(1, Math.round(viewport.width * dpr)); canvas.height = Math.max(1, Math.round(viewport.height * dpr));
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    }
  }

  private drawGrid(camera: CameraState): void {
    const ctx = this.grid, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    let spacing = 58.4 * camera.zoom;
    while (spacing < 26) spacing *= 2;
    const pixels = Math.max(1, Math.round(spacing * dpr)), step = pixels / dpr;
    const key = `${pixels}:${dpr}`;
    if (this.patternKey !== key) {
      const tile = this.backdrop.ownerDocument.createElement('canvas'); tile.width = pixels; tile.height = pixels;
      const tileCtx = tile.getContext('2d');
      if (tileCtx) { tileCtx.fillStyle = 'rgb(128 137 157 / .6)'; tileCtx.fillRect(pixels / 2 - .75 * dpr, pixels / 2 - .75 * dpr, 1.5 * dpr, 1.5 * dpr); this.pattern = ctx.createPattern(tile, 'repeat'); }
      this.patternKey = key;
    }
    if (!this.pattern) return;
    ctx.save(); ctx.globalAlpha = Math.max(.45, Math.min(1, (camera.zoom - .1) / .4));
    ctx.scale(1 / dpr, 1 / dpr); ctx.translate(((camera.x + 16.5 * camera.zoom - step / 2) % step) * dpr, ((camera.y + 25.5 * camera.zoom - step / 2) % step) * dpr);
    ctx.fillStyle = this.pattern; ctx.fillRect(-pixels, -pixels, this.width * dpr + pixels * 2, this.height * dpr + pixels * 2); ctx.restore();
  }

  private arrow(point: Point, from: Point): void {
    const length = Math.hypot(point.x - from.x, point.y - from.y) || 1, x = (point.x - from.x) / length, y = (point.y - from.y) / length, ctx = this.ink;
    ctx.beginPath(); ctx.moveTo(point.x - x * 11 - y * 5, point.y - y * 11 + x * 5); ctx.lineTo(point.x, point.y);
    ctx.lineTo(point.x - x * 11 + y * 5, point.y - y * 11 - x * 5); ctx.stroke();
  }
}
