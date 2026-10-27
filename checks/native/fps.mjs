#!/usr/bin/env node
// Measure the real Aegis window through its existing installed-UI loader.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  app: { type: 'string' },
  runs: { type: 'string', default: '3' },
  frames: { type: 'string', default: '600' },
  'warmup-ms': { type: 'string', default: '1500' },
  'min-fps': { type: 'string', default: '0' },
  'collector-port': { type: 'string', default: '0' },
  out: { type: 'string' },
  screenshot: { type: 'boolean', default: false },
} });
assert(values.app, 'Pass --app /absolute/path/to/Aegis.app/Contents/MacOS/aegis or a cargo build binary');
const integer = (value, name, minimum) => {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= minimum, `Invalid ${name}`);
  return number;
};
const runs = integer(values.runs, 'runs', 1);
const frames = integer(values.frames, 'frames', 60);
const warmupMs = integer(values['warmup-ms'], 'warmup-ms', 0);
const minFps = integer(values['min-fps'], 'min-fps', 0);
const collectorPort = integer(values['collector-port'], 'collector-port', 0);
assert(collectorPort <= 65535, 'Invalid collector-port');
const source = dirname(fileURLToPath(import.meta.url));
const out = values.out ? resolve(values.out) : await mkdtemp(join(tmpdir(), 'aegis-fps-evidence-'));
await mkdir(out, { recursive: true });
const reports = [];

for (let run = 1; run <= runs; run++) {
  const data = await mkdtemp(join(tmpdir(), 'aegis-fps-data-'));
  const cache = await mkdtemp(join(tmpdir(), 'aegis-fps-vite-'));
  const ui = join(data, 'ui', 'current');
  await mkdir(ui, { recursive: true });
  await copyFile(join(source, 'fps.html'), join(ui, 'index.html'));
  await copyFile(join(source, 'fps.page.mjs'), join(ui, 'fps.page.mjs'));
  await copyFile(join(source, 'frame-stats.mjs'), join(ui, 'frame-stats.mjs'));
  const nonce = `/${randomUUID()}`;
  let accept;
  const reportPromise = new Promise(resolve => { accept = resolve; });
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.method !== 'POST' || request.url !== nonce) {
      response.writeHead(404).end();
      return;
    }
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 16384) throw new Error('Oversized probe response');
      }
      const report = JSON.parse(body);
      response.writeHead(200).end('ok');
      accept(report);
    } catch {
      response.writeHead(400).end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(collectorPort, '127.0.0.1', resolve); });
  await writeFile(join(ui, 'fps.config.mjs'), `export default ${JSON.stringify({
    frames, warmupMs, collector: `http://127.0.0.1:${server.address().port}${nonce}`,
  })};\n`);
  const env = { ...process.env, AEGIS_DATA: data, AEGIS_VITE_CACHE: cache, AEGIS_UI: ui };
  delete env.AEGIS_SAFE;
  delete env.AEGIS_PRINT_TOKEN;
  const child = spawn(resolve(values.app), [], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', error => resolve({ error: error.message }));
  });
  let timer;
  try {
    const report = await Promise.race([
      reportPromise,
      exited.then(exit => { throw new Error(`App exited before reporting: ${JSON.stringify(exit)}`); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Probe timed out')), 45000); }),
    ]);
    assert(!report.error, report.error);
    for (const key of ['fps', 'p50', 'p95', 'max']) assert(Number.isFinite(report[key]) && report[key] > 0, `Invalid ${key}`);
    assert.equal(report.frames, frames);
    assert.equal(report.hidden, false, 'Webview became hidden during the measurement');
    assert.equal(report.hostConnected, true);
    assert.equal(report.tauri, true, 'Result must come from the Tauri webview');
    reports.push({ run, ...report });
    console.log(JSON.stringify({ run, ...report }));
    await writeFile(join(out, `run-${run}.json`), JSON.stringify(report, null, 2));
    if (values.screenshot) {
      const windowId = execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
        ObjC.import('CoreGraphics');
        const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0)));
        const window = windows.find(item => item.kCGWindowOwnerPID === ${child.pid} && item.kCGWindowLayer === 0);
        if (!window) throw new Error('No visible window for the launched app');
        String(window.kCGWindowNumber);
      `], { encoding: 'utf8' }).trim();
      assert(/^\d+$/.test(windowId), 'Invalid screenshot window ID');
      execFileSync('/usr/sbin/screencapture', ['-x', '-o', '-l', windowId, join(out, `run-${run}.png`)]);
    }
  } finally {
    clearTimeout(timer);
    // This PID is the executable spawned above. Its host exits when the parent pipe closes.
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    let quitTimer;
    const quit = await Promise.race([
      exited.then(() => true),
      new Promise(resolve => { quitTimer = setTimeout(() => resolve(false), 4000); }),
    ]);
    clearTimeout(quitTimer);
    if (!quit) { child.kill('SIGKILL'); await exited; }
    await new Promise(resolve => server.close(resolve));
    // Tokens are generated only for this temporary data folder. Never retain them in evidence.
    const redact = text => text.replace(/([?&]token=|"token"\s*:\s*")[^&"\s]+/g, '$1<REDACTED>');
    await writeFile(join(out, `run-${run}.log`), redact(stdout + stderr));
  }
}

await writeFile(join(out, 'summary.json'), JSON.stringify({
  app: resolve(values.app), runs: reports, minFps,
  macOS: execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(),
}, null, 2));
console.log(`Evidence: ${out}`);
assert(reports.every(report => report.fps >= minFps), `Expected at least ${minFps} fps in every run`);
