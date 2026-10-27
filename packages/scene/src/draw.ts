import type { CardId, Link } from '@aegis/domain/schema';
import type { CameraState, Point, Rect } from './geometry.js';
import type { LinkRoute } from './links.js';
import type { Representation } from './types.js';

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

  constructor(backdrop: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    const grid = backdrop.getContext('2d'), ink = overlay.getContext('2d');
    if (!grid || !ink) throw new Error('Scene requires two 2D canvas contexts');
    this.backdrop = backdrop; this.overlay = overlay; this.grid = grid; this.ink = ink;
  }

  paint(viewport: Rect, dpr: number, camera: CameraState, representations: readonly Representation[], links: readonly DrawLink[], mounted: (id: CardId) => boolean, selected: ReadonlySet<CardId>, marquee: Rect | null): void {
    this.resize(viewport, dpr);
    this.drawGrid(camera);
    const ctx = this.ink;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    ctx.lineWidth = 1; ctx.font = '12px Inter, sans-serif';
    for (const { link, route } of links) {
      const { p0, p2, control } = route;
      ctx.strokeStyle = link.colour || '#56565e'; ctx.fillStyle = ctx.strokeStyle;
      ctx.setLineDash(link.dash ? [5, 5] : []);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(control.x, control.y, p2.x, p2.y); ctx.stroke(); ctx.setLineDash([]);
      if (link.arrow !== 'none') this.arrow(p2, control);
      if (link.arrow === 'both') this.arrow(p0, control);
      if (link.label && camera.zoom >= 0.12) {
        ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(link.label, route.label.x, route.label.y - 10);
        ctx.fillStyle = '#b5b5bd'; ctx.fillText(link.label, route.label.x, route.label.y - 10); ctx.lineWidth = 1;
      }
    }
    for (const rep of representations) {
      const r = rep.bounds;
      if (rep.kind === 'cluster' && rep.rotation === 0) {
        ctx.fillStyle = '#252529'; ctx.fillRect(r.x, r.y, r.width, r.height);
        if (selected.has(rep.id)) { ctx.strokeStyle = '#c6c6ce'; ctx.strokeRect(r.x - 3, r.y - 3, r.width + 6, r.height + 6); }
        continue;
      }
      if (rep.kind !== 'detail' || !mounted(rep.id)) {
        ctx.save(); ctx.translate(r.x + r.width / 2, r.y + r.height / 2); ctx.rotate(rep.rotation * Math.PI / 180);
        ctx.fillStyle = '#151517'; ctx.strokeStyle = '#303035'; ctx.beginPath(); ctx.roundRect(-r.width / 2, -r.height / 2, r.width, r.height, Math.min(8, r.height / 4)); ctx.fill(); ctx.stroke();
        if (rep.kind !== 'cluster' && r.width >= 50 && r.height >= 25) {
          ctx.beginPath(); ctx.rect(-r.width / 2 + 8, -r.height / 2 + 4, Math.max(0, r.width - 16), Math.max(0, r.height - 8)); ctx.clip();
          ctx.fillStyle = '#dadade'; ctx.textAlign = 'left'; ctx.font = `${rep.kind === 'summary' ? 14 : Math.max(10, Math.min(16, 14 * camera.zoom))}px Inter, sans-serif`;
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
    let spacing = 32 * camera.zoom;
    while (spacing < 26) spacing *= 2;
    const pixels = Math.max(1, Math.round(spacing * dpr)), step = pixels / dpr;
    const key = `${pixels}:${dpr}`;
    if (this.patternKey !== key) {
      const tile = this.backdrop.ownerDocument.createElement('canvas'); tile.width = pixels; tile.height = pixels;
      const tileCtx = tile.getContext('2d');
      if (tileCtx) { tileCtx.fillStyle = '#29292e'; tileCtx.beginPath(); tileCtx.arc(pixels / 2, pixels / 2, 0.65 * dpr, 0, Math.PI * 2); tileCtx.fill(); this.pattern = ctx.createPattern(tile, 'repeat'); }
      this.patternKey = key;
    }
    if (!this.pattern) return;
    ctx.save(); ctx.scale(1 / dpr, 1 / dpr); ctx.translate((camera.x % step) * dpr, (camera.y % step) * dpr);
    ctx.fillStyle = this.pattern; ctx.fillRect(-pixels, -pixels, this.width * dpr + pixels * 2, this.height * dpr + pixels * 2); ctx.restore();
  }

  private arrow(point: Point, from: Point): void {
    const angle = Math.atan2(point.y - from.y, point.x - from.x), size = 7, ctx = this.ink;
    ctx.beginPath(); ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x - Math.cos(angle - 0.45) * size, point.y - Math.sin(angle - 0.45) * size);
    ctx.lineTo(point.x - Math.cos(angle + 0.45) * size, point.y - Math.sin(angle + 0.45) * size); ctx.closePath(); ctx.fill();
  }
}
