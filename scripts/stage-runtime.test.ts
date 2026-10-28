import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageRuntime } from './stage-runtime.ts';

const owned: string[] = [];
afterEach(() => { for (const root of owned.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aegis-stage-unit-'));
  owned.push(root);
  const source = join(root, 'source');
  for (const [path, name] of [['agent', '@aegis/agent'], ['packages/domain', '@aegis/domain'], ['packages/protocol', '@aegis/protocol']] as const) {
    mkdirSync(join(source, path, 'dist'), { recursive: true });
    writeFileSync(join(source, path, 'package.json'), JSON.stringify({ name }));
    writeFileSync(join(source, path, 'dist', path === 'agent' ? 'main.js' : 'index.js'), 'export const fixture = true;');
  }
  mkdirSync(join(source, 'agent/skills'), { recursive: true });
  mkdirSync(join(source, 'plugins/aegis'), { recursive: true });
  mkdirSync(join(source, 'agent/node_modules/.bin'), { recursive: true });
  return { root, source };
}

it('stages contained dependency links through an aliased destination', () => {
  const { root, source } = fixture();
  mkdirSync(join(source, 'agent/node_modules/fixture'));
  writeFileSync(join(source, 'agent/node_modules/fixture/entry.js'), 'export const fixture = true;');
  symlinkSync('../fixture/entry.js', join(source, 'agent/node_modules/.bin/fixture'));
  mkdirSync(join(root, 'physical'));
  symlinkSync(join(root, 'physical'), join(root, 'alias'), 'dir');
  const destination = join(root, 'alias/runtime');
  stageRuntime({ root: source, destination });
  expect(realpathSync(join(destination, 'agent/node_modules/.bin/fixture'))).toBe(realpathSync(join(destination, 'agent/node_modules/fixture/entry.js')));
});

it('still refuses a dependency link outside the staged runtime', () => {
  const { root, source } = fixture();
  const outside = join(root, 'outside.js');
  writeFileSync(outside, 'export const outside = true;');
  symlinkSync(outside, join(source, 'agent/node_modules/.bin/outside'));
  expect(() => stageRuntime({ root: source, destination: join(root, 'runtime') })).toThrow(/symlink escapes staging directory/);
});
