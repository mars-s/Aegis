// Installing a new UI without rebuilding the app, in the shape of Mars's updater (build beside, check, swap, keep
// the previous one): the window loads DATA/ui/current; an update builds into DATA/ui/incoming-<id>, checks it, then
// renames current -> previous-<id> and incoming -> current. A rename in one folder is atomic, so the window
// never sees half a UI. Rollback renames the newest previous back. AEGIS_SAFE=1 in the shell ignores all of it.
import { spawn } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const run = (cmd, args, cwd) => new Promise((resolve) => {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '0' } });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  child.on('close', code => resolve({ code, out: out.slice(-4000) }));
  child.on('error', e => resolve({ code: -1, out: String(e) }));
});

// A built UI is usable when it has an index.html whose scripts and styles all exist.
export async function checkBuilt(dir) {
  const html = await readFile(join(dir, 'index.html'), 'utf8').catch(() => null);
  if (!html) return { ok: false, reason: 'no index.html' };
  const refs = [...html.matchAll(/(?:src|href)="\.?\/?([^"]+\.(?:js|css))"/g)].map(m => m[1]);
  if (!refs.length) return { ok: false, reason: 'index.html loads no scripts' };
  for (const ref of refs) if (!(await stat(join(dir, ref)).catch(() => null))?.isFile()) return { ok: false, reason: `missing ${ref}` };
  return { ok: true, files: refs.length };
}

export function createUiUpdater({ data, appDir, onChange }) {
  const root = join(data, 'ui');
  let busy = null;
  const steps = [];
  const log = (step, detail = '') => { steps.push({ at: Date.now(), step, detail }); if (steps.length > 40) steps.shift(); onChange?.(); };

  async function status() {
    const names = await readdir(root).catch(() => []);
    return {
      installed: names.includes('current'),
      previous: names.filter(n => n.startsWith('previous-')).sort().reverse(),
      busy: busy?.id ?? null,
      steps: steps.slice(-12),
    };
  }

  // Build the app source at `source` (default: this checkout's app folder), check it and swap it in.
  // `from` installs an already built folder instead (used by checks and by a lane's preview build).
  async function install({ source = appDir, from } = {}) {
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
        log('check', 'svelte-check');
        const check = await run('npx', ['--no-install', 'svelte-check', '--tsconfig', './tsconfig.json', '--threshold', 'error', '--output', 'machine'], source);
        if (check.code !== 0) { log('refused', 'type check failed'); return { ok: false, step: 'check', out: check.out }; }
        log('build', 'vite build');
        const build = await run('npx', ['--no-install', 'vite', 'build', '--outDir', incoming, '--emptyOutDir'], source);
        if (build.code !== 0) { log('refused', 'build failed'); return { ok: false, step: 'build', out: build.out }; }
      }
      const verdict = await checkBuilt(incoming);
      if (!verdict.ok) { log('refused', verdict.reason); return { ok: false, step: 'verify', out: verdict.reason }; }
      log('swap', id);
      const current = join(root, 'current');
      const had = !!(await stat(current).catch(() => null));
      if (had) await rename(current, join(root, `previous-${id}`));
      await rename(incoming, current);
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
