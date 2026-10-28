// Installing a new UI without rebuilding the app, in the shape of Mars's updater (build beside, check, swap, keep
// the previous one): the window loads DATA/ui/current; an update builds into DATA/ui/incoming-<id>, checks it, then
// renames current -> previous-<id> and incoming -> current. A rename in one folder is atomic, so the window
// never sees half a UI. Rollback renames the newest previous back. AEGIS_SAFE=1 in the shell ignores all of it.
import { spawn } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { HostLifetime } from './lifetime.js';
import { randomBytes } from 'node:crypto';

const run = (cmd: string, args: string[], cwd: string, signal?: AbortSignal): Promise<{ code: number | null; out: string }> => new Promise((resolve) => {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '0' }, detached: process.platform !== 'win32' });
  const abort = () => { if (child.pid) { try { if (process.platform === 'win32') child.kill(); else process.kill(-child.pid, 'SIGTERM'); } catch {} } };
  signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  let out = '';
  child.stdout.on('data', (d: unknown) => { out = (out + String(d)).slice(-4000); }); child.stderr.on('data', (d: unknown) => { out = (out + String(d)).slice(-4000); });
  child.on('close', code => { signal?.removeEventListener('abort', abort); resolve({ code, out }); });
  child.on('error', error => { signal?.removeEventListener('abort', abort); resolve({ code: -1, out: String(error) }); });
});

// A built UI is usable when it has an index.html whose scripts and styles all exist.
export async function checkBuilt(dir: string): Promise<{ ok: true; files: number } | { ok: false; reason: string }> {
  const html = await readFile(join(dir, 'index.html'), 'utf8').catch(() => null);
  if (!html) return { ok: false, reason: 'no index.html' };
  const protocol = /<meta\s+name=["']aegis-ui-protocol["']\s+content=["']([^"']+)["']/i.exec(html)?.[1] ?? '1';
  if (protocol !== '1') return { ok: false, reason: `unsupported UI protocol ${protocol}` };
  const refs = [...html.matchAll(/(?:src|href)="\.?\/?([^"]+\.(?:js|css))"/g)].flatMap(m => m[1] ? [m[1]] : []);
  if (!refs.length) return { ok: false, reason: 'index.html loads no scripts' };
  for (const ref of refs) if (!(await stat(join(dir, ref)).catch(() => null))?.isFile()) return { ok: false, reason: `missing ${ref}` };
  return { ok: true, files: refs.length };
}

export function createUiUpdater({ data, appDir, onChange, lifetime }: { data: string; appDir: string; onChange?: () => void; lifetime?: HostLifetime }) {
  const root = join(data, 'ui');
  const execute = (cmd: string, args: string[], cwd: string) => lifetime ? lifetime.run(signal => run(cmd, args, cwd, signal)) : run(cmd, args, cwd);
  let busy: { id: string } | null = null;
  const steps: { at: number; step: string; detail: string }[] = [];
  const log = (step: string, detail = '') => { steps.push({ at: Date.now(), step, detail }); if (steps.length > 40) steps.shift(); onChange?.(); };

  async function status() {
    const names: string[] = await readdir(root).catch(() => []);
    return {
      installed: names.includes('current'),
      previous: names.filter(n => n.startsWith('previous-')).sort().reverse(),
      busy: busy?.id ?? null,
      steps: steps.slice(-12),
    };
  }

  // Build the app source at `source` (default: this checkout's app folder), check it and swap it in.
  // `from` installs an already built folder instead (used by checks and by a lane's preview build).
  async function install({ source = appDir, from }: { source?: string; from?: string } = {}) {
    if (busy) throw Object.assign(new Error('an update is already running'), { status: 409 });
    const id = `${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;
    busy = { id };
    const incoming = join(root, `incoming-${id}`);
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      if (from) {
        log('copy', from);
        await cp(from, incoming, { recursive: true });
      } else {
        const sourceRoot = dirname(source);
        log('check', 'npm run check');
        const check = await execute('npm', ['run', 'check'], sourceRoot);
        if (check.code !== 0) { log('refused', 'type check failed'); return { ok: false, step: 'check', out: check.out }; }
        log('build', 'vite build');
        const build = await execute('npm', ['--workspace', '@aegis/app', 'run', 'build', '--', '--outDir', incoming, '--emptyOutDir'], sourceRoot);
        if (build.code !== 0) { log('refused', 'build failed'); return { ok: false, step: 'build', out: build.out }; }
      }
      const verdict = await checkBuilt(incoming);
      if (!verdict.ok) { log('refused', verdict.reason); return { ok: false, step: 'verify', out: verdict.reason }; }
      log('swap', id);
      const current = join(root, 'current');
      const had = !!(await stat(current).catch(() => null));
      const previous = join(root, `previous-${id}`);
      if (had) await rename(current, previous);
      try { await rename(incoming, current); }
      catch (error) { if (had) await rename(previous, current); throw error; }
      // Keep the three most recent previous versions for rollback.
      const old = (await readdir(root)).filter(n => n.startsWith('previous-')).sort().reverse().slice(3);
      for (const n of old) await rm(join(root, n), { recursive: true, force: true });
      log('installed', id);
      return { ok: true, id, next: 'Reload the window to use it. If it misbehaves, roll back.' };
    } finally {
      await rm(incoming, { recursive: true, force: true }).catch(() => {});
      busy = null; onChange?.();
    }
  }

  // Put the newest previous version back; with none left, remove the installed UI so the bundled one loads.
  async function rollback() {
    if (busy) throw Object.assign(new Error('an update is running'), { status: 409 });
    const current = join(root, 'current');
    const prev = (await readdir(root).catch(() => [])).filter(n => n.startsWith('previous-')).sort().reverse()[0];
    const bad = join(root, `rejected-${Date.now()}`);
    if (await stat(current).catch(() => null)) await rename(current, bad);
    if (prev) await rename(join(root, prev), current);
    await rm(bad, { recursive: true, force: true }).catch(() => {});
    log('rolled back', prev ?? 'to the bundled UI');
    onChange?.();
    return { ok: true, now: prev ?? 'bundled' };
  }

  return { status, install, rollback };
}
