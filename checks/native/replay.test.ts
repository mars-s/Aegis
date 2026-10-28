import type { FrameParticipant } from '@aegis/scene';
import type { ReplayStep } from './replay-fixture.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { frameStats, replayPasses } from './frame-stats.ts';
import { mixedBoard, replayPlan } from './replay-fixture.ts';
import { replayScene } from './replay-driver.ts';
import { artifactIdentity, uiIdentity } from './build-identity.ts';

test('120 Hz passes, 60 Hz fails, missed display slots remain in the result', () => {
  const fast = frameStats(Array<number>(600).fill(1000 / 120));
  assert.equal(replayPasses(fast), true);
  assert.equal(fast.within12_5MsPercent, 100);
  assert.equal(fast.droppedPercent, 0);
  const slow = frameStats(Array<number>(600).fill(1000 / 60));
  assert.equal(replayPasses(slow), false);
  assert.equal(slow.within12_5MsPercent, 0);
  assert.equal(slow.droppedPercent, 50);
  const stalled = frameStats([...Array<number>(599).fill(1000 / 120), 1000]);
  assert.equal(stalled.max, 1000);
  assert.equal(stalled.droppedFrames, 119);
  assert.throws(() => frameStats([0, 8]));
});

test('the 95 percent and 9 ms gates reject a good median with too many slow frames', () => {
  assert.equal(replayPasses(frameStats([...Array<number>(570).fill(8), ...Array<number>(30).fill(17)])), true);
  assert.equal(replayPasses(frameStats([...Array<number>(569).fill(8), ...Array<number>(31).fill(17)])), false);
  assert.equal(replayPasses(frameStats(Array<number>(600).fill(9.01))), false);
  const edge = frameStats([8, 8, 9, 12.5]);
  assert.equal(edge.p50, 8);
  assert.equal(edge.p95, 12.5);
  assert.equal(edge.within12_5Ms, 4);
});

test('the owned fixture contains 50 real payloads of each of six kinds', () => {
  const board = mixedBoard();
  assert.equal(board.cards.length, 300);
  assert.equal(new Set(board.cards.map(card => card.id)).size, 300);
  const kinds: Record<string, number> = {};
  for (const card of board.cards) {
    const kind = card.type === 'object' ? `object:${card.kind}` : card.type;
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    assert(card.w > 0 && card.h > 0 && card.text.length > 0);
  }
  assert.deepEqual(kinds, { note: 50, todo: 50, doc: 50, 'object:sheet': 50, 'object:plot': 50, 'object:stats': 50 });
  let zoom = board.view.z, x = board.view.x, y = board.view.y;
  for (const step of replayPlan()) {
    if (step.zoom) zoom *= Math.exp(-step.dy * 0.01);
    else { x -= step.dx; y -= step.dy; }
  }
  assert(Math.abs(zoom - 0.42) < 1e-10);
  assert(Math.abs(x - board.view.x) < 1e-10 && Math.abs(y - board.view.y) < 1e-10);
});

// This checks driver ordering only. It is not native performance evidence.
function sceneDouble({ stall = false } = {}) {
  let participant: FrameParticipant | undefined;
  let active = false, removed = false, scheduled = false, frames = 0, camera = { x: 0, y: 0, zoom: 0.28 };
  const samples: { interval: number; cpu: number }[] = [];
  const inputs: ReplayStep[] = [];
  const schedule = () => {
    if (stall || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      for (const input of inputs.splice(0)) {
        if (input.zoom) camera.zoom *= Math.exp(-input.dy * 0.01);
        else { camera.x -= input.dx; camera.y -= input.dy; }
      }
      participant?.write?.();
      samples.push({ interval: frames++ ? 1000 / 120 : 0, cpu: 1 });
    });
  };
  return {
    engine: {
      recordMetrics(enabled: boolean) { active = enabled; },
      registerFrameParticipant(value: FrameParticipant) { participant = value; schedule(); return () => { participant = undefined; removed = true; }; },
      camera: () => ({ ...camera }), samples: () => [...samples],
    },
    dispatch(input: ReplayStep) { assert(active); inputs.push(input); schedule(); },
    clean: () => removed && !active,
  };
}

test('the scene participant includes every gesture frame and excludes only its bootstrap', async () => {
  const scene = sceneDouble(), plan = replayPlan();
  const result = await replayScene({ engine: scene.engine, dispatch: scene.dispatch, plan });
  assert.equal(result.samples.length, 600);
  assert(result.samples.every(sample => sample.interval > 0));
  assert.deepEqual(result.samples.map(sample => sample.phase), plan.map(step => step.phase));
  const finalCamera = result.cameras.at(-1);
  assert(finalCamera);
  assert(Math.abs(finalCamera.zoom - 0.42) < 1e-10);
  assert.equal(scene.clean(), true);
});

test('a stalled scene fails and releases its participant and recorder', async () => {
  const scene = sceneDouble({ stall: true });
  await assert.rejects(replayScene({ engine: scene.engine, dispatch: scene.dispatch, plan: replayPlan(), timeoutMs: 10 }), /stopped producing frames/);
  assert.equal(scene.clean(), true);
});

test('a broken actual input path fails without leaving the recorder running', async () => {
  const scene = sceneDouble();
  await assert.rejects(replayScene({ engine: scene.engine, dispatch: () => { throw new Error('Wheel was not handled'); }, plan: replayPlan() }), /Wheel was not handled/);
  assert.equal(scene.clean(), true);
});

test('artifact identity rejects legacy builds and detects changed compiled bytes', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'aegis-native-identity-unit-'));
  try {
    const ui = join(temp, 'ui'), app = join(temp, 'aegis');
    await mkdir(ui);
    await writeFile(app, 'unit fixture, never executed');
    await writeFile(join(ui, 'index.html'), '<head><script type="module" src="./entry.js"></script></head>');
    await writeFile(join(ui, 'entry.js'), 'export const fixture = 1;');
    await writeFile(join(ui, 'aegis-build.json'), JSON.stringify({ implementation: 'legacy', facade: true }));
    await assert.rejects(uiIdentity(ui), /AEGIS_UI_IMPL=react/);
    await writeFile(join(ui, 'aegis-build.json'), JSON.stringify({ implementation: 'react', facade: false }));
    await assert.rejects(uiIdentity(ui), /AEGIS_TEST_FACADE=1/);
    await writeFile(join(ui, 'aegis-build.json'), JSON.stringify({ implementation: 'react', facade: true }));
    const original = await artifactIdentity(app, ui);
    await writeFile(join(ui, 'entry.js'), 'export const fixture = 2;');
    const changed = await artifactIdentity(app, ui);
    assert.notEqual(original.uiIdentity.sha256, changed.uiIdentity.sha256);
    assert.equal(original.executableSha256, changed.executableSha256);
    await writeFile(app, 'changed unit fixture, never executed');
    assert.notEqual((await artifactIdentity(app, ui)).executableSha256, original.executableSha256);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
