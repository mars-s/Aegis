import type { FramePhase, FrameSample } from './types.js';

const PHASES = ['input', 'camera', 'cull', 'reads', 'writes'] as const;

/** Fixed-size storage is opt-in. Objects are created only when sampled on demand. */
export class FrameMetrics {
  private enabled = false;
  private position = 0;
  private count = 0;
  private readonly capacity = 4096;
  private readonly stride = 12;
  private readonly values = new Float64Array(this.capacity * this.stride);

  record(enabled: boolean): void { this.enabled = enabled; this.count = 0; this.position = 0; }
  push(start: number, interval: number, cpu: number, phases: Readonly<Record<FramePhase, number>>, latency: number | null, candidates: number, links: number, leases: number): void {
    if (!this.enabled) return;
    const offset = this.position * this.stride;
    this.values[offset] = start; this.values[offset + 1] = interval; this.values[offset + 2] = cpu;
    for (const [i, phase] of PHASES.entries()) this.values[offset + 3 + i] = phases[phase];
    this.values[offset + 8] = latency ?? -1; this.values[offset + 9] = candidates; this.values[offset + 10] = links; this.values[offset + 11] = leases;
    this.position = (this.position + 1) % this.capacity; this.count = Math.min(this.capacity, this.count + 1);
  }
  samples(): readonly FrameSample[] {
    const output: FrameSample[] = [];
    for (let i = 0; i < this.count; i++) {
      const offset = ((this.position - this.count + i + this.capacity) % this.capacity) * this.stride;
      const value = (index: number): number => this.values[offset + index] ?? 0;
      output.push({ start: value(0), interval: value(1), cpu: value(2), phases: { input: value(3), camera: value(4), cull: value(5), reads: value(6), writes: value(7) }, inputToWrite: value(8) < 0 ? null : value(8), candidates: value(9), links: value(10), leases: value(11) });
    }
    return output;
  }
}
