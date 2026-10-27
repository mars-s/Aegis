import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { projectRepresentations } from '@aegis/scene/layout';

const baseline = execFileSync(process.execPath, ['/Users/avi/.codex/orchestrate/aegis-react/evidence/spatial-layout-bench.mjs'], { encoding: 'utf8' });
const results = [];
for (const n of [10, 20, 40, 80]) {
  const cols = Math.ceil(Math.sqrt(n));
  const items = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, kind: 'note', summarised: true, bounds: { x: (i % cols) * 520, y: Math.floor(i / cols) * 400, width: 480, height: 360 } }));
  const samples = [];
  for (let frame = 0; frame < 30; frame++) {
    const start = performance.now();
    projectRepresentations(items, { x: -frame * 3, y: -frame * 2, zoom: 0.45 });
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  results.push({ cards: n, p50: samples[15] ?? 0, max: samples[29] ?? 0, samples });
}
const report = { note: 'Static projection per standing order 18. The former summary-packing baseline measures different work.', baseline, results, runtime: process.version, measuredAt: new Date().toISOString() };
const output = process.argv[2];
if (output) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
