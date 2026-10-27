import { BoardIdSchema, BoardSchema } from "@aegis/domain";
import type { CanvasEngine } from "@aegis/scene";
import type { Workspace } from "../workspace/index.js";

function histogram(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
  const bins = new Uint32Array(201);
  let overflow = 0;
  for (const value of values) {
    const bin = Math.floor(value / 0.25);
    if (bin >= bins.length) overflow++;
    else bins[bin] = (bins[bin] ?? 0) + 1;
  }
  return { count: values.length, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: sorted.at(-1) ?? 0, stepMs: 0.25, bins: Array.from(bins), overflow };
}

export async function benchmark(engine: CanvasEngine, workspace: Workspace, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 50000) throw new Error("Benchmark count must be an integer from 1 to 50000.");
  const board = BoardSchema.parse({
    id: BoardIdSchema.parse("bench"), name: "Benchmark", rev: 1, links: [], view: { x: 0, y: 0, z: 1 },
    cards: Array.from({ length: count }, (_, index) => ({ id: `p${index.toString(36).padStart(7, "0")}`, type: "note", x: index % 100 * 260, y: Math.floor(index / 100) * 130, w: 220, h: 96, text: `Card ${index}`, color: "plain" })),
  });
  if (!workspace.replaceBoard(board)) throw new Error("Save queued edits before benchmarking.");
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("The benchmark canvas is missing.");
  const nextFrame = async (before: number): Promise<void> => {
    const deadline = performance.now() + 20000;
    while (engine.inspect().frameCount <= before) {
      if (performance.now() > deadline) throw new Error("The scene stopped producing requested frames.");
      await new Promise<void>(done => setTimeout(done, 1));
    }
  };
  engine.invalidate();
  await nextFrame(engine.inspect().frameCount);
  await new Promise<void>(done => setTimeout(done, 100));
  engine.recordMetrics(true);
  const started = performance.now();
  let mountedNear = 0;
  let samples: ReturnType<CanvasEngine["samples"]>;
  let release = (): void => {};
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((done, fail) => {
      let index = 0;
      const advance = (): void => {
        try {
          if (index === 150) mountedNear = engine.inspect().activeLeases;
          if (index === 240) { done(); return; }
          stage.dispatchEvent(new WheelEvent("wheel", index < 150
            ? { deltaX: 40, deltaY: 25, bubbles: true, cancelable: true }
            : { deltaY: 30, ctrlKey: true, clientX: 600, clientY: 400, bubbles: true, cancelable: true }));
          index++;
        } catch (error) { fail(error); }
      };
      timeout = setTimeout(() => fail(new Error("The scene stopped producing requested frames.")), 20000);
      release = engine.registerFrameParticipant({ write: () => queueMicrotask(advance) });
      advance();
    });
    samples = engine.samples();
  } finally {
    clearTimeout(timeout);
    release();
    engine.recordMetrics(false);
  }
  const intervals = samples.map(sample => sample.interval).filter(interval => interval > 0);
  const result = {
    runtime: "chromium" as const, pacing: "headless, display refresh unverified", cards: count, frames: samples.length,
    seconds: (performance.now() - started) / 1000, mountedNear, mountedFar: engine.inspect().activeLeases,
    zoom: engine.camera().zoom, interval: histogram(intervals), callbackCpu: histogram(samples.map(sample => sample.cpu)), samples,
  };
  document.body.dataset.bench = JSON.stringify({ cards: count, p50ms: result.interval.p50, p95ms: result.interval.p95, maxms: result.interval.max, cpuP95ms: result.callbackCpu.p95 });
  return result;
}
