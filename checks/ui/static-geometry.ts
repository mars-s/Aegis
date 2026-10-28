import { required } from './playwright.ts';
import type { Page, Locator } from './playwright.ts';
import assert from 'node:assert/strict';


interface PaintCommand { readonly method: 'moveTo' | 'lineTo' | 'quadraticCurveTo'; readonly args: readonly number[] }
interface LinkPaint {
  readonly commands: readonly PaintCommand[];
  readonly preview: boolean;
  readonly transform: { readonly a: number; readonly d: number; readonly e: number; readonly f: number };
  readonly width: number;
  readonly dash: number[];
  readonly colour: string | CanvasGradient | CanvasPattern;
}
declare global { interface HTMLCanvasElement { linkPaint?: LinkPaint[] } }
export const settleCamera = (page: Page) => page.evaluate(() => new Promise<number>(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// Observe real canvas commands while retaining the drawing calls and pixels.
export async function observeLinkPaint(page: Page) {
  await page.evaluate(() => {
    const { uiChecks, aegis } = window;
    if (!aegis) throw Error('Missing Aegis test facade');
    const canvas = uiChecks.canvas(document.querySelector('.scene-overlay'));
    if (canvas.linkPaint) return;
    const context = uiChecks.required(canvas.getContext('2d'));
    const strokes: LinkPaint[] = [], paths = new WeakMap<Path2D, PaintCommand[]>();
    window.Path2D = new Proxy(window.Path2D, { construct(Target, args: unknown[]) {
      const source = args[0];
      if (source !== undefined && typeof source !== 'string' && !(source instanceof Path2D)) throw Error('Invalid observed path');
      const path = source === undefined ? new Target() : new Target(source);
      if (typeof source === 'string') paths.set(path, [...source.matchAll(/([MLQ])([^MLQ]+)/g)].map(match => {
        const kind = uiChecks.required(match[1]), values = uiChecks.required(match[2]);
        return { method: kind === 'M' ? 'moveTo' : kind === 'Q' ? 'quadraticCurveTo' : 'lineTo', args: values.trim().split(/[ ,]+/).map(Number) };
      }));
      return path;
    } });
    let commands: PaintCommand[] = [];
    canvas.linkPaint = strokes;
    const clearRect = context.clearRect.bind(context), beginPath = context.beginPath.bind(context), moveTo = context.moveTo.bind(context), lineTo = context.lineTo.bind(context), quadraticCurveTo = context.quadraticCurveTo.bind(context), stroke = context.stroke.bind(context);
    context.clearRect = (...args) => { strokes.length = 0; clearRect(...args); };
    context.beginPath = () => { commands = []; beginPath(); };
    context.moveTo = (x, y) => { commands.push({ method: 'moveTo', args: [x, y] }); moveTo(x, y); };
    context.lineTo = (x, y) => { commands.push({ method: 'lineTo', args: [x, y] }); lineTo(x, y); };
    context.quadraticCurveTo = (cpx, cpy, x, y) => { commands.push({ method: 'quadraticCurveTo', args: [cpx, cpy, x, y] }); quadraticCurveTo(cpx, cpy, x, y); };
    context.stroke = (path?: Path2D) => {
      const transform = context.getTransform();
      strokes.push({ commands: path ? paths.get(path) ?? [] : commands.slice(), preview: path !== undefined, transform: { a: transform.a, d: transform.d, e: transform.e, f: transform.f }, width: context.lineWidth, dash: context.getLineDash(), colour: context.strokeStyle });
      if (path) stroke(path); else stroke();
    };
    aegis.canvas.engine.invalidate();
  });
  await settleCamera(page);
}

// Also runs inside the scene's post-paint participant.
export function renderedLinks() {
  const { uiChecks, aegis } = window;
  if (!aegis) throw Error('Missing Aegis test facade');
  const canvas = uiChecks.canvas(document.querySelector('.scene-overlay'));
  const engine = aegis.canvas.engine, v = aegis.canvas.view;
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < .01;
  const point = (command: PaintCommand | undefined) => { const c = uiChecks.required(command); return { x: uiChecks.required(c.args.at(-2)), y: uiChecks.required(c.args.at(-1)) }; };
  const strokes = canvas.linkPaint ?? [];
  return engine.linkGeometry().map(({ id, route }) => {
    const painted = strokes.find(stroke => stroke.commands[0]?.method === 'moveTo' && near(point(stroke.commands[0]), route.p0) && near(point(stroke.commands.at(-1)), route.p2));
    if (!painted) throw Error(`${id}: the scene did not stroke its rendered connector`);
    const first = painted.commands[0], last = painted.commands.at(-1);
    const mid = route.points.length ? uiChecks.required(route.points[Math.floor(route.points.length / 2)]) : { x: (route.p0.x + 2 * route.control.x + route.p2.x) / 4, y: (route.p0.y + 2 * route.control.y + route.p2.y) / 4 };
    const start = point(first), end = point(last);
    const arrows = strokes.filter(stroke => stroke.commands.length === 3 && stroke.commands.map(command => command.method).join() === 'moveTo,lineTo,lineTo' && [start, end].some(tip => near(point(stroke.commands[1]), tip) && Math.abs(Math.hypot(point(stroke.commands[0]).x - tip.x, point(stroke.commands[0]).y - tip.y) - Math.hypot(11, 5)) < .01)).length;
    return { id, d: painted.commands.map(command => `${command.method === 'moveTo' ? 'M' : command.method === 'quadraticCurveTo' ? 'Q' : 'L'}${command.args.join(' ')}`).join(' '), start, end, stroke: `${painted.width}px`, hit: engine.hitTestLink(mid) === id ? 'stroke' : 'none', arrows, camera: v };
  });
}
export async function readRenderedLinks(page: Page) { await observeLinkPaint(page); return page.evaluate(renderedLinks); }

export async function readConnectionPreview(page: Page, at: { x: number; y: number }) {
  return page.evaluate(at => {
    const { uiChecks, aegis } = window;
    if (!aegis) throw Error('Missing Aegis test facade');
    const canvas = uiChecks.canvas(document.querySelector('.scene-overlay'));
    const creative = document.querySelector('.creative-connections [data-connect-preview]');
    if (creative) {
      const path = uiChecks.svgPath(creative), target = document.querySelector('.creative-connections [data-connect-target]'), matrix = path.getScreenCTM(), style = getComputedStyle(path);
      if (!target || !matrix || path.getTotalLength() === 0 || style.stroke === 'none' || Number.parseFloat(style.strokeWidth) <= 0) throw Error('The creative connection preview is not painted');
      const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix);
      return { target: target.getAttribute('data-connect-target'), end: { x: end.x, y: end.y } };
    }
    const paints = canvas.linkPaint ?? [];
    const stroke = paints.findLast(stroke => stroke.preview && stroke.commands.at(-1)?.method === 'quadraticCurveTo');
    if (!stroke) {
      const target = document.elementFromPoint(at.x, at.y);
      throw Error('The connection tool did not paint a preview: ' + JSON.stringify({ cursor: uiChecks.html(document.getElementById('stage')).style.cursor, target: target && { tag: target.tagName, text: target.textContent?.slice(0, 100), parent: target.parentElement?.className }, strokes: paints.map(stroke => ({ preview: stroke.preview, commands: stroke.commands })) }));
    }
    const last = uiChecks.required(stroke.commands.at(-1)), transform = stroke.transform;
    return { target: aegis.canvas.engine.hitTest(at), end: { x: (uiChecks.required(last.args.at(-2)) * transform.a + transform.e) / devicePixelRatio, y: (uiChecks.required(last.args.at(-1)) * transform.d + transform.f) / devicePixelRatio } };
  }, at);
}

// Expectations use saved world geometry independently of renderer projection helpers.
export async function assertStaticWindows(page: Page, ids?: readonly string[]) {
  const measurements = await page.evaluate(ids => {
    const { uiChecks, aegis } = window;
    if (!aegis) throw Error('Missing Aegis test facade');
    const v = aegis.canvas.view;
    return aegis.canvas.board.cards.filter(c => !ids || ids.includes(c.id)).map(c => {
      const el = document.querySelector(`#world > .card[data-id="${c.id}"]`), r = el?.getBoundingClientRect();
      const angle = (c.rot || 0) * Math.PI / 180, cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
      const w = (c.w * cos + c.h * sin) * v.z, h = (c.w * sin + c.h * cos) * v.z;
      return { id: c.id, actual: r && { x: r.x, y: r.y, w: r.width, h: r.height }, expected: { x: (c.x + c.w / 2) * v.z + v.x - w / 2, y: (c.y + c.h / 2) * v.z + v.y - h / 2, w, h }, inert: el ? uiChecks.html(el).inert : undefined, opacity: el && getComputedStyle(el).opacity, content: el?.childElementCount, connected: el?.isConnected };
    });
  }, ids);
  assert.ok(measurements.length, 'the geometry check must exercise real windows');
  for (const m of measurements) {
    assert.ok(m.actual && m.connected && m.content !== undefined && m.content > 0, `${m.id}: real content DOM is present`);
    for (const key of ['x', 'y', 'w', 'h'] as const) assert.ok(Math.abs(m.actual[key] - m.expected[key]) <= 1, JSON.stringify(m));
    assert.equal(m.inert, false, `${m.id}: content stays interactive`);
    assert.equal(m.opacity, '1', `${m.id}: content stays visible`);
  }
  assert.equal(await page.locator('.semantic-window, .semantic-summaries, .board-overview, .overview-cluster, .overview-back, .agent-zoom-summary, .agent-semantic').count(), 0);
  assert.equal(await page.locator('#stage[data-zoom-tier], #stage[data-has-summaries]').count(), 0);
  return measurements.map(m => ({ ...m, actual: required(m.actual) }));
}
export async function assertRealLinkEdges(page: Page) {
  const rendered = await readRenderedLinks(page);
  const links = await page.evaluate(rendered => {
    const { uiChecks, aegis } = window;
    if (!aegis) throw Error('Missing Aegis test facade');
    return aegis.canvas.board.links.map(link => {
      const path = rendered.find(entry => entry.id === link.id), v = aegis.canvas.view;
      if (!path) throw Error(`${link.id}: connector is missing from the rendered scene`);
      return { id: link.id, endpoints: [link.a, link.b].map((id, i) => {
        const c = uiChecks.required(aegis.canvas.board.cards.find(c => c.id === id)), p = i ? path.end : path.start;
        const x = (p.x - v.x) / v.z - c.x - c.w / 2, y = (p.y - v.y) / v.z - c.y - c.h / 2, angle = -(c.rot || 0) * Math.PI / 180;
        return { x: x * Math.cos(angle) - y * Math.sin(angle) + c.w / 2, y: x * Math.sin(angle) + y * Math.cos(angle) + c.h / 2, w: c.w, h: c.h, tolerance: .5 / v.z };
      }), stroke: path.stroke, hit: path.hit };
    });
  }, rendered);
  assert.ok(links.length, 'the edge check must exercise a real link');
  for (const link of links) {
    assert.equal(link.stroke, '1.5px'); assert.equal(link.hit, 'stroke');
    for (const p of link.endpoints) {
      assert.ok(p.x >= -p.tolerance && p.y >= -p.tolerance && p.x <= p.w + p.tolerance && p.y <= p.h + p.tolerance, JSON.stringify(link));
      assert.ok(Math.min(Math.abs(p.x), Math.abs(p.x - p.w), Math.abs(p.y), Math.abs(p.y - p.h)) <= p.tolerance, JSON.stringify(link));
    }
  }
  const arrowCount = await page.evaluate(() => {
    const aegis = window.aegis; if (!aegis) throw Error('Missing Aegis test facade');
    return aegis.canvas.board.links.reduce((count, link) => count + (link.arrow === 'both' ? 2 : link.arrow === 'end' ? 1 : 0), 0);
  });
  assert.equal(rendered.reduce((count, link) => count + link.arrows, 0), arrowCount, 'all requested arrowheads remain present');
  return links;
}
export async function assertFitBounds(page: Page) {
  const geometry = await assertStaticWindows(page), area = await page.evaluate(() => { const aegis = window.aegis; if (!aegis) throw Error('Missing Aegis test facade'); return aegis.canvas.availableArea; });
  for (const { id, actual: r } of geometry) assert.ok(r.x >= area.x - 1 && r.y >= area.y - 1 && r.x + r.w <= area.x + area.w + 1 && r.y + r.h <= area.y + area.h + 1, `${id}: Fit includes the real bounds: ${JSON.stringify({ r, area })}`);
  return geometry;
}
export async function readDiagramTopology(card: Locator) {
  return card.evaluate(el => {
    const { uiChecks } = window, nodes = [...el.querySelectorAll('.node')], rects = nodes.map(n => n.getBoundingClientRect());
    const endpoint = (value: Element, at: boolean) => {
      const path = uiChecks.svgPath(value), p = path.getPointAtLength(at ? path.getTotalLength() : 0).matrixTransform(uiChecks.required(path.getScreenCTM()));
      const distances = rects.map(r => Math.hypot(Math.max(r.left - p.x, p.x - r.right, 0), Math.max(r.top - p.y, p.y - r.bottom, 0)));
      return distances.indexOf(Math.min(...distances));
    };
    return { names: nodes.map(n => uiChecks.required(n.querySelector('strong')).textContent), edges: [...el.querySelectorAll('.flow > path:first-child')].map(path => [endpoint(path, false), endpoint(path, true)]), labels: nodes.map(node => ({ font: parseFloat(getComputedStyle(uiChecks.required(node.querySelector('strong'))).fontSize), clipped: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1 })) };
  });
}
export async function assertCameraScale(page: Page, ids: readonly string[]) {
  assert.ok(ids.length, 'the camera check must exercise an existing window');
  const before = await page.evaluate(() => { const aegis = window.aegis; if (!aegis) throw Error('Missing Aegis test facade'); return { ...aegis.canvas.view }; });
  for (const id of ids) for (const z of [.3, .5, .75, 1, 2] as const) {
    await page.evaluate(({ id, z }) => { const { uiChecks, aegis } = window; if (!aegis) throw Error('Missing Aegis test facade'); const c = uiChecks.required(aegis.canvas.board.cards.find(c => c.id === id)); aegis.canvas.setView({ x: innerWidth / 2 - (c.x + c.w / 2) * z, y: innerHeight / 2 - (c.y + c.h / 2) * z, z }); }, { id, z });
    await settleCamera(page);
    await page.waitForFunction(id => { const { uiChecks, aegis } = window; if (!aegis) throw Error('Missing Aegis test facade'); const c = uiChecks.required(aegis.canvas.board.cards.find(c => c.id === id)), el = aegis.canvas.mountedEl(id); if (!el) return false; const measuresContent = !c.props?.fixedHeight && (c.type === 'object' || c.props?.contentFit); return (!measuresContent || el.dataset.intrinsicHeight && Math.abs(Number(el.dataset.intrinsicHeight) - c.h) <= 1) && Math.abs(parseFloat(el.style.height) - c.h) <= 1; }, id);
    await settleCamera(page); await assertStaticWindows(page, [id]);
  }
  await page.evaluate(view => { const aegis = window.aegis; if (!aegis) throw Error('Missing Aegis test facade'); aegis.canvas.setView(view); }, before); await settleCamera(page);
}
