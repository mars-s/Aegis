import assert from 'node:assert/strict';

export const settleCamera = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

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
  const links = await page.evaluate(() => aegis.canvas.board.links.map(link => {
    const path = document.querySelector(`[data-link-line="${link.id}"]`), v = aegis.canvas.view;
    return { id: link.id, endpoints: [link.a, link.b].map((id, i) => {
      const c = aegis.canvas.board.cards.find(c => c.id === id), p = path.getPointAtLength(i ? path.getTotalLength() : 0);
      const x = (p.x - v.x) / v.z - c.x - c.w / 2, y = (p.y - v.y) / v.z - c.y - c.h / 2, angle = -(c.rot || 0) * Math.PI / 180;
      return { x: x * Math.cos(angle) - y * Math.sin(angle) + c.w / 2, y: x * Math.sin(angle) + y * Math.cos(angle) + c.h / 2, w: c.w, h: c.h, tolerance: .5 / v.z };
    }), stroke: getComputedStyle(path).strokeWidth, hit: getComputedStyle(document.querySelector(`[data-link="${link.id}"]`)).pointerEvents };
  }));
  assert.ok(links.length, 'the edge check must exercise a real link');
  for (const link of links) {
    assert.equal(link.stroke, '1.5px'); assert.equal(link.hit, 'stroke');
    for (const p of link.endpoints) {
      assert.ok(p.x >= -p.tolerance && p.y >= -p.tolerance && p.x <= p.w + p.tolerance && p.y <= p.h + p.tolerance, JSON.stringify(link));
      assert.ok(Math.min(Math.abs(p.x), Math.abs(p.x - p.w), Math.abs(p.y), Math.abs(p.y - p.h)) <= p.tolerance, JSON.stringify(link));
    }
  }
  const arrowCount = await page.evaluate(() => aegis.canvas.board.links.reduce((count, link) => count + (link.arrow === 'both' ? 2 : link.arrow === 'end' || link.arrow === true ? 1 : 0), 0));
  assert.equal(await page.locator('#links path:not([class])').count(), arrowCount, 'all requested arrowheads remain present');
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
