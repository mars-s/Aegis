import { z } from 'zod';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export function checkout(root: string) {
  const git = (args: readonly string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  return { head: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']), trackedChanges: git(['status', '--porcelain', '--untracked-files=no']) };
}

export async function fileHash(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function uiIdentity(root: string) {
  const files: { path: string; sha256: string }[] = [];
  async function walk(relative = ''): Promise<void> {
    for (const name of (await readdir(join(root, relative))).sort()) {
      const path = join(relative, name), info = await lstat(join(root, path));
      assert(!info.isSymbolicLink(), `Built UI must contain regular files, not symlinks: ${path}`);
      if (info.isDirectory()) await walk(path);
      else { assert(info.isFile(), `Unexpected UI entry: ${path}`); files.push({ path, sha256: await fileHash(join(root, path)) }); }
    }
  }
  await walk();
  const marker = z.object({ implementation: z.string(), facade: z.boolean() }).parse(JSON.parse(await readFile(join(root, 'aegis-build.json'), 'utf8')));
  assert.equal(marker.implementation, 'react', 'Build with AEGIS_UI_IMPL=react');
  assert.equal(marker.facade, true, 'Build with AEGIS_TEST_FACADE=1');
  const html = await readFile(join(root, 'index.html'), 'utf8');
  assert.match(html, /<script\b[^>]*type=["']module["'][^>]*>/, 'Expected a compiled module entry');
  assert(!html.includes('/src/main.ts'), 'Expected compiled UI, not a Vite source page');
  return { marker, files, sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex') };
}

export async function artifactIdentity(app: string, ui: string) {
  assert((await lstat(app)).isFile(), 'Pass the built Aegis executable inside its .app bundle');
  return { executableSha256: await fileHash(app), uiIdentity: await uiIdentity(ui) };
}
