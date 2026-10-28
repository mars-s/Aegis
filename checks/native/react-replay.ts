#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { BuildManifestSchema, ReplayReportSchema, FailureSchema } from './schemas.ts';
import type { BuildManifest, ReplayReport } from './schemas.ts';
import { buildNativePages, browserOutput } from './build-pages.ts';
import { artifactIdentity, checkout } from './build-identity.ts';
import { frameStats, replayPasses } from './frame-stats.ts';
import { mixedBoard, replayPlan } from './replay-fixture.ts';

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, '../..');
const { values } = parseArgs({ options: {
  build: { type: 'string' }, out: { type: 'string' }, runs: { type: 'string', default: '3' },
  'warmup-ms': { type: 'string', default: '2500' }, 'collector-port': { type: 'string' },
  'check-build': { type: 'boolean', default: false }, screenshot: { type: 'boolean', default: false },
  help: { type: 'boolean', default: false },
} });
if (values.help) {
  log('node checks/native/react-replay.ts --build /tmp/aegis-native-build.json [--runs 3] [--out /tmp/evidence] [--check-build] [--screenshot]');
} else {
  await main();
}

function integer(value: string | undefined, name: string, min: number, max: number) {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= min && number <= max, `Invalid ${name}`);
  return number;
}

async function main() {
  assert(values.build, 'Pass --build from checks/native/build-react.ts');
  const runs = integer(values.runs, 'runs', 1, 20);
  const warmupMs = integer(values['warmup-ms'], 'warmup-ms', 500, 30000);
  const block = Number(process.env.AEGIS_PORT_OFFSET ?? '4100');
  const port = integer(values['collector-port'] ?? String(block), 'collector-port', block, block + 19);
  const build = BuildManifestSchema.parse(JSON.parse(await readFile(resolve(values.build), 'utf8')));
  assert.equal(build.schema, 1);
  assert.equal(build.command, 'npm run build', 'Use the native build wrapper for provenance');
  assert.match(build.head, /^[a-f0-9]{40}$/);
  const current = checkout(root);
  assert.equal(current.trackedChanges, '', 'Commit tracked changes before measuring');
  assert.equal(current.head, build.head, 'Measured checkout must match the actual native build head');
  const identity = await artifactIdentity(build.app, build.ui);
  assert.equal(identity.executableSha256, build.executableSha256, 'Native executable changed since build');
  assert.deepEqual(identity.uiIdentity, build.uiIdentity, 'Compiled React assets changed since build');
  if (values['check-build']) {
    log(JSON.stringify({ head: build.head, app: build.app, executableSha256: identity.executableSha256, uiSha256: identity.uiIdentity.sha256, marker: identity.uiIdentity.marker }));
    return;
  }
  assert.equal(process.platform, 'darwin', 'Native replay requires macOS WKWebView');
  const out = values.out ? resolve(values.out) : await mkdtemp(join(tmpdir(), 'aegis-native-react-evidence-'));
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'build.json'), JSON.stringify(build, null, 2) + '\n');
  const probeArgs = [join(source, 'fps.ts'), '--app', build.app, '--runs', String(runs), '--warmup-ms', String(warmupMs), '--min-fps', '100', '--collector-port', String(port), '--out', join(out, 'probe')];
  if (values.screenshot) probeArgs.push('--screenshot');
  const probe = spawn(process.execPath, probeArgs, { stdio: 'inherit' });
  const probeExit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done, fail) => {
    probe.once('error', fail);
    probe.once('exit', (code, signal) => done({ code, signal }));
  });
  const reports: ((ReplayReport & { run: number }) | { run: number; error: string })[] = [];
  await buildNativePages();
  for (let run = 1; run <= runs; run++) {
    try {
      const report = await runReplay({ build, out, run, warmupMs, port });
      reports.push({ run, ...report });
      log(JSON.stringify({ run, ...report, samples: undefined }));
    } catch (error) {
      const failure = { run, error: String(error) };
      reports.push(failure);
      await writeFile(join(out, `replay-${run}-failure.json`), JSON.stringify(failure, null, 2) + '\n');
      process.stderr.write(JSON.stringify(failure) + '\n');
    }
  }
  const pass = probeExit.code === 0 && reports.every(report => 'pass' in report && report.pass === true);
  const summary = { pass, head: build.head, app: build.app, executableSha256: build.executableSha256, uiSha256: identity.uiIdentity.sha256, probeExit, runs: reports, macOS: execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(), node: process.version };
  await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  log(`Evidence: ${out}`);
  assert(pass, 'Native gate failed. Every React run needs p50 <= 9 ms and >= 95% of intervals <= 12.5 ms; probe needs >= 100 fps.');
}

async function runReplay({ build, out, run, warmupMs, port }: { readonly build: BuildManifest; readonly out: string; readonly run: number; readonly warmupMs: number; readonly port: number }): Promise<ReplayReport> {
  const data = await mkdtemp(join(tmpdir(), 'aegis-native-react-data-'));
  const cache = await mkdtemp(join(tmpdir(), 'aegis-native-react-vite-'));
  const ui = join(data, 'ui', 'current');
  const nonce = `/${randomUUID()}`;
  let accept: ((value: unknown) => void) | undefined;
  const reported = new Promise<unknown>(resolve => { accept = resolve; });
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.method !== 'POST' || request.url !== nonce) { response.writeHead(404).end(); return; }
    try {
      let body = '';
      for await (const chunk of request) { body += chunk; if (body.length > 2_000_000) throw new Error('Oversized replay report'); }
      const report: unknown = JSON.parse(body);
      response.writeHead(200).end('ok');
      if (!accept) throw new Error("Collector is not ready");
      accept(report);
    } catch { response.writeHead(400).end(); }
  });
  let child: ReturnType<typeof spawn> | undefined;
  let exited: Promise<unknown> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stdout = '', stderr = '';
  try {
    await cp(build.ui, ui, { recursive: true, mode: constants.COPYFILE_FICLONE });
    // Only this disposable index changes. All compiled application modules stay intact.
    const html = await readFile(join(ui, 'index.html'), 'utf8');
    assert(html.includes('</head>'), 'Compiled UI has no head element');
    await writeFile(join(ui, 'index.html'), html.replace('<head>', '<head>\n<script type="module" src="./react-replay.page.js"></script>'));
    await cp(browserOutput, ui, { recursive: true });
    await mkdir(join(data, 'boards'), { recursive: true });
    await writeFile(join(data, 'boards', 'native-perf.json'), JSON.stringify(mixedBoard()));
    await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', done); });
    const updated = await readFile(join(ui, 'index.html'), 'utf8');
    await writeFile(join(ui, 'index.html'), updated.replace('<head>', `<head><script type="application/json" id="native-config">${JSON.stringify({ warmupMs, collector: `http://127.0.0.1:${port}${nonce}` })}</script>`));
    const environment: NodeJS.ProcessEnv = { ...process.env, AEGIS_DATA: data, AEGIS_VITE_CACHE: cache, AEGIS_UI: ui, AEGIS_UI_IMPL: 'react', AEGIS_TEST_FACADE: '1', AEGIS_FAKE_MODEL: '1', AEGIS_PORT_OFFSET: String(port) };
    delete environment.AEGIS_SAFE;
    delete environment.AEGIS_PRINT_TOKEN;
    const launched = spawn(build.app, [], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    child = launched;
    child.stdout?.on('data', bytes => { stdout = (stdout + bytes).slice(-1_000_000); });
    child.stderr?.on('data', bytes => { stderr = (stderr + bytes).slice(-1_000_000); });
    exited = new Promise(resolve => {
      launched.once('exit', (code, signal) => resolve({ code, signal }));
      launched.once('error', error => resolve({ error: error.message }));
    });
    const report = z.union([ReplayReportSchema, FailureSchema]).parse(await Promise.race([
      reported,
      exited.then(exit => { throw new Error(`App exited before reporting: ${JSON.stringify(exit)}`); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native React replay timed out')), 90000); }),
    ]));
    // Preserve failures and raw scene intervals before evaluating the acceptance gate.
    await writeFile(join(out, `replay-${run}.json`), JSON.stringify({ ...report, head: build.head, executableSha256: build.executableSha256 }, null, 2) + '\n');
    if ('error' in report) throw new Error(String(report.error));
    assert.equal(report.kind, 'react-scene-replay');
    assert.equal(report.tauri, true);
    assert.equal(report.hidden, false);
    assert.equal(report.hostConnected, true);
    assert.equal(report.cards, 300);
    assert.equal(report.implementation?.marker?.implementation, 'react');
    assert.equal(report.implementation?.marker?.facade, true);
    assert.equal(report.implementation?.rootManagedByReact, true);
    for (const kind of ['note', 'todo', 'doc', 'object:sheet', 'object:plot', 'object:stats']) assert((report.implementation.bodies[kind] ?? 0) > 0, `Missing actual React ${kind} content`);
    const plan = replayPlan();
    assert.equal(report.samples?.length, plan.length);
    assert.deepEqual(report.samples.map(sample => sample.phase), plan.map(step => step.phase));
    const computed = frameStats(report.samples.map(sample => sample.interval));
    for (const [key, value] of Object.entries(computed)) assert.equal(report[key], value, `Inconsistent ${key}`);
    assert.equal(report.pass, replayPasses(computed));
    if (values.screenshot) screenshot(child.pid, join(out, `replay-${run}.png`));
    return report;
  } finally {
    clearTimeout(timer);
    if (child && exited) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      let quitTimer: ReturnType<typeof setTimeout> | undefined;
      const stopped = await Promise.race([exited.then(() => true), new Promise(resolve => { quitTimer = setTimeout(() => resolve(false), 4000); })]);
      clearTimeout(quitTimer);
      if (!stopped) { child.kill('SIGKILL'); await exited; }
    }
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    const redact = (text: string) => text.replace(/([?&]token=|"token"\s*:\s*")[^&"\s]+/g, '$1<REDACTED>');
    await writeFile(join(out, `replay-${run}.log`), redact(stdout + stderr));
    await rm(data, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
  }
}

function screenshot(pid: number | undefined, path: string) {
  assert(pid, 'Native app has no PID');
  const windowId = execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
    ObjC.import('CoreGraphics');
    const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0)));
    const window = windows.find(item => item.kCGWindowOwnerPID === ${pid} && item.kCGWindowLayer === 0);
    if (!window) throw new Error('No visible window for the launched app');
    String(window.kCGWindowNumber);
  `], { encoding: 'utf8' }).trim();
  assert(/^\d+$/.test(windowId), 'Invalid screenshot window ID');
  execFileSync('/usr/sbin/screencapture', ['-x', '-o', '-l', windowId, path]);
}

function log(value: string): void { process.stdout.write(value + '\n'); }
