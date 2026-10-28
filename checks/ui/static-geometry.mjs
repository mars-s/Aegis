import assert from 'node:assert/strict';

export const settleCamera = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// Observe the real canvas commands, preserving the native drawing calls and pixels.
export async function observeLinkPaint(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('.scene-overlay');
    if (!canvas || canvas.linkPaint) return;
    const context = canvas.getContext('2d');
    const strokes = [];
    const paths = new WeakMap();
    window.Path2D = new Proxy(window.Path2D, { construct(Target, args) {
      const path = Reflect.construct(Target, args);
      const source = args[0];
      if (typeof source === 'string') paths.set(path, [...source.matchAll(/([MLQ])([^MLQ]+)/g)].map(([, kind, values]) => ({ method: kind === 'M' ? 'moveTo' : kind === 'Q' ? 'quadraticCurveTo' : 'lineTo', args: values.trim().split(/[ ,]+/).map(Number) })));
      return path;
    } });
    let commands = [];
    canvas.linkPaint = strokes;
    for (const method of ['clearRect', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'stroke']) {
      const original = context[method];
      context[method] = function (...args) {
        if (method === 'clearRect') strokes.length = 0;
        else if (method === 'beginPath') commands = [];
        else if (method === 'stroke') {
          const transform = this.getTransform();
          strokes.push({ commands: args.length ? paths.get(args[0]) ?? [] : commands.slice(), preview: args.length > 0, transform: { a: transform.a, d: transform.d, e: transform.e, f: transform.f }, width: this.lineWidth, dash: this.getLineDash(), colour: this.strokeStyle });
        }
        else commands.push({ method, args });
        return Reflect.apply(original, this, args);
      };
    }
    aegis.canvas.engine.invalidate();
  });
  await settleCamera(page);
}

// Runs in the page, including inside the scene's post-paint participant.
export function renderedLinks() {
  const canvas = document.querySelector('.scene-overlay');
  const engine = aegis.canvas.engine, v = aegis.canvas.view;
  if (!canvas) return aegis.canvas.board.links.map(link => {
    const path = document.querySelector(`[data-link-line="${link.id}"]`);
    const start = path.getPointAtLength(0), end = path.getPointAtLength(path.getTotalLength());
    return { id: link.id, d: path.getAttribute('d'), start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y }, stroke: getComputedStyle(path).strokeWidth, hit: getComputedStyle(document.querySelector(`[data-link="${link.id}"]`)).pointerEvents, arrows: document.querySelectorAll('#links path:not([class])').length };
  });
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < .01;
  const point = command => ({ x: command.args.at(-2), y: command.args.at(-1) });
  const strokes = canvas.linkPaint ?? [];
  return engine.linkGeometry().map(({ id, route }) => {
    const painted = strokes.find(stroke => stroke.commands[0]?.method === 'moveTo' && near(point(stroke.commands[0]), route.p0) && near(point(stroke.commands.at(-1)), route.p2));
    if (!painted) throw Error(`${id}: the scene did not stroke its rendered connector`);
    const first = painted.commands[0], last = painted.commands.at(-1);
    const mid = route.points.length ? route.points[Math.floor(route.points.length / 2)] : { x: (route.p0.x + 2 * route.control.x + route.p2.x) / 4, y: (route.p0.y + 2 * route.control.y + route.p2.y) / 4 };
    const start = point(first), end = point(last);
    const arrows = strokes.filter(stroke => stroke.commands.length === 3 && stroke.commands.map(command => command.method).join() === 'moveTo,lineTo,lineTo' && [start, end].some(tip => near(point(stroke.commands[1]), tip) && Math.abs(Math.hypot(point(stroke.commands[0]).x - tip.x, point(stroke.commands[0]).y - tip.y) - Math.hypot(11, 5)) < .01)).length;
    return { id, d: painted.commands.map(command => `${command.method === 'moveTo' ? 'M' : command.method === 'quadraticCurveTo' ? 'Q' : 'L'}${command.args.join(' ')}`).join(' '), start, end, stroke: `${painted.width}px`, hit: engine.hitTestLink(mid) === id ? 'stroke' : 'none', arrows, camera: v };
  });
}

export async function readRenderedLinks(page) {
  await observeLinkPaint(page);
  return page.evaluate(renderedLinks);
}

export async function readConnectionPreview(page, at) {
  return page.evaluate(at => {
    const canvas = document.querySelector('.scene-overlay');
    const creative = document.querySelector('.creative-connections [data-connect-preview]');
    if (creative) {
      const target = document.querySelector('.creative-connections [data-connect-target]'), matrix = creative.getScreenCTM(), style = getComputedStyle(creative);
      if (!target || !matrix || creative.getTotalLength() === 0 || style.stroke === 'none' || Number.parseFloat(style.strokeWidth) <= 0) throw Error('The creative connection preview is not painted');
      const end = creative.getPointAtLength(creative.getTotalLength()).matrixTransform(matrix);
      return { target: target.getAttribute('data-connect-target'), end: { x: end.x, y: end.y } };
    }
    if (!canvas) {
      const target = document.querySelector('[data-connect-target]'), path = document.querySelector('[data-connect-preview]');
      const end = path.getPointAtLength(path.getTotalLength());
      return { target: target.getAttribute('data-connect-target'), end: { x: end.x, y: end.y } };
    }
    const stroke = canvas.linkPaint.findLast(stroke => stroke.preview && stroke.commands.at(-1)?.method === 'quadraticCurveTo');
    if (!stroke) {
      const target = document.elementFromPoint(at.x, at.y);
      throw Error('The connection tool did not paint a preview: ' + JSON.stringify({ cursor: document.getElementById('stage').style.cursor, target: target && { tag: target.tagName, text: target.textContent?.slice(0, 100), parent: target.parentElement?.className }, strokes: canvas.linkPaint.map(stroke => ({ preview: stroke.preview, commands: stroke.commands })) }));
    }
    const last = stroke.commands.at(-1), transform = stroke.transform;
    return { target: aegis.canvas.engine.hitTest(at), end: { x: (last.args.at(-2) * transform.a + transform.e) / devicePixelRatio, y: (last.args.at(-1) * transform.d + transform.f) / devicePixelRatio } };
  }, at);
}

// Expectations use the saved world geometry, independently of the renderer's projection helpers.
export async function assertStaticWindows(page, ids) {
  const measurements = await page.evaluate(ids => {
    const v = aegis.canvas.view;
    return aegis.canvas.board.cards.filter(c => !ids || ids.includes(c.id)).map(c => {
      const el = document.querySelector(`#world > .card[data-id="${c.id}"]`), r = el?.getBoundingClientRect();
      const angle = (c.rot || 0) * Math.PI / 180, cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
      const w = (c.w * cos + c.h * sin) * v.z, h = (c.w * sin + c.h * cos) * v.z;
      return { id: c.id, actual: r && { x: r.x, y: r.y, w: r.width, h: r.height }, expected: { x: (c.x + c.w / 2) * v.z + v.x - w / 2, y: (c.y + c.h / 2) * v.z + v.y - h / 2, w, h }, inert: el?.inert, opacity: el && getComputedStyle(el).opacity, content: el?.childElementCount, connected: el?.isConnected };
    });
  }, ids);
  assert.ok(measurements.length, 'the geometry check must exercise real windows');
  for (const m of measurements) {
    assert.ok(m.actual && m.connected && m.content > 0, `${m.id}: real content DOM is present`);
    for (const key of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(m.actual[key] - m.expected[key]) <= 1, JSON.stringify(m));
    assert.equal(m.inert, false, `${m.id}: content stays interactive`);
    assert.equal(m.opacity, '1', `${m.id}: content stays visible`);
  }
  assert.equal(await page.locator('.semantic-window, .semantic-summaries, .board-overview, .overview-cluster, .overview-back, .agent-zoom-summary, .agent-semantic').count(), 0);
  assert.equal(await page.locator('#stage[data-zoom-tier], #stage[data-has-summaries]').count(), 0);
  return measurements;
}

export async function assertRealLinkEdges(page) {
  const rendered = await readRenderedLinks(page);
  const links = await page.evaluate(rendered => aegis.canvas.board.links.map(link => {
    const path = rendered.find(entry => entry.id === link.id), v = aegis.canvas.view;
    if (!path) throw Error(`${link.id}: connector is missing from the rendered scene`);
    return { id: link.id, endpoints: [link.a, link.b].map((id, i) => {
      const c = aegis.canvas.board.cards.find(c => c.id === id), p = i ? path.end : path.start;
      const x = (p.x - v.x) / v.z - c.x - c.w / 2, y = (p.y - v.y) / v.z - c.y - c.h / 2, angle = -(c.rot || 0) * Math.PI / 180;
      return { x: x * Math.cos(angle) - y * Math.sin(angle) + c.w / 2, y: x * Math.sin(angle) + y * Math.cos(angle) + c.h / 2, w: c.w, h: c.h, tolerance: .5 / v.z };
    }), stroke: path.stroke, hit: path.hit };
  }), rendered);
  assert.ok(links.length, 'the edge check must exercise a real link');
  for (const link of links) {
    assert.equal(link.stroke, '1.5px'); assert.equal(link.hit, 'stroke');
    for (const p of link.endpoints) {
      assert.ok(p.x >= -p.tolerance && p.y >= -p.tolerance && p.x <= p.w + p.tolerance && p.y <= p.h + p.tolerance, JSON.stringify(link));
      assert.ok(Math.min(Math.abs(p.x), Math.abs(p.x - p.w), Math.abs(p.y), Math.abs(p.y - p.h)) <= p.tolerance, JSON.stringify(link));
    }
  }
  const arrowCount = await page.evaluate(() => aegis.canvas.board.links.reduce((count, link) => count + (link.arrow === 'both' ? 2 : link.arrow === 'end' || link.arrow === true ? 1 : 0), 0));
  const paintedArrows = await page.locator('.scene-overlay').count() ? rendered.reduce((count, link) => count + link.arrows, 0) : await page.locator('#links path:not([class])').count();
  assert.equal(paintedArrows, arrowCount, 'all requested arrowheads remain present');
  return links;
}

export async function assertFitBounds(page) {
  const geometry = await assertStaticWindows(page);
  const area = await page.evaluate(() => aegis.canvas.availableArea);
  for (const { id, actual: r } of geometry) assert.ok(r.x >= area.x - 1 && r.y >= area.y - 1 && r.x + r.w <= area.x + area.w + 1 && r.y + r.h <= area.y + area.h + 1, `${id}: Fit includes the real bounds: ${JSON.stringify({ r, area })}`);
  return geometry;
}

export async function readDiagramTopology(card) {
  return card.evaluate(el => {
    const nodes = [...el.querySelectorAll('.node')], rects = nodes.map(n => n.getBoundingClientRect());
    const endpoint = (path, at) => {
      const p = path.getPointAtLength(at ? path.getTotalLength() : 0).matrixTransform(path.getScreenCTM());
      const distances = rects.map(r => Math.hypot(Math.max(r.left - p.x, p.x - r.right, 0), Math.max(r.top - p.y, p.y - r.bottom, 0)));
      return distances.indexOf(Math.min(...distances));
    };
    return { names: nodes.map(n => n.querySelector('strong').textContent), edges: [...el.querySelectorAll('.flow > path:first-child')].map(path => [endpoint(path, false), endpoint(path, true)]), labels: nodes.map(node => ({ font: parseFloat(getComputedStyle(node.querySelector('strong')).fontSize), clipped: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1 })) };
  });
}

export async function assertCameraScale(page, ids) {
  assert.ok(ids.length, 'the camera check must exercise an existing window');
  const before = await page.evaluate(() => ({ ...aegis.canvas.view }));
  for (const id of ids) for (const z of [.3, .5, .75, 1, 2]) {
    await page.evaluate(({ id, z }) => {
      const c = aegis.canvas.board.cards.find(c => c.id === id);
      aegis.canvas.setView({ x: innerWidth / 2 - (c.x + c.w / 2) * z, y: innerHeight / 2 - (c.y + c.h / 2) * z, z });
    }, { id, z });
    await settleCamera(page);
    await page.waitForFunction(id => {
      const c = aegis.canvas.board.cards.find(c => c.id === id), el = aegis.canvas.mountedEl(id);
      if (!el) return false;
      const measuresContent = !c.props?.fixedHeight && (c.type === 'object' || c.props?.contentFit);
      return (!measuresContent || el.dataset.intrinsicHeight && Math.abs(Number(el.dataset.intrinsicHeight) - c.h) <= 1) && Math.abs(parseFloat(el.style.height) - c.h) <= 1;
    }, id);
    await settleCamera(page); await assertStaticWindows(page, [id]);
  }
  await page.evaluate(view => aegis.canvas.setView(view), before); await settleCamera(page);
}
