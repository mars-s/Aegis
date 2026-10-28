import { describe, expect, test } from 'vitest';
import type { CanvasEngine } from '@aegis/scene';
import { toolExit } from '../../../app/src/platform/tool-lifetime.js';

function fixture() {
  const pending: (() => void)[] = [];
  let name: string | null = 'draw-ink', exits = 0;
  const host: Pick<CanvasEngine, 'afterInput' | 'tool' | 'toolName'> = {
    afterInput: callback => { pending.push(callback); },
    tool: value => { name = value?.id ?? null; },
    toolName: () => name,
  };
  return { host, next: (value: string) => { name = value; }, drain: () => { for (const callback of pending.splice(0)) callback(); }, finished: () => { exits++; }, exits: () => exits };
}

describe('deferred tool exit', () => {
  test('Escape cleanup does not disarm a newly armed tool', () => {
    const f = fixture(), exit = toolExit(f.host, 'draw-ink', f.finished);
    exit(); f.next('draw-shape'); toolExit(f.host, 'draw-shape', f.finished); f.drain();
    expect(f.host.toolName()).toBe('draw-shape'); expect(f.exits()).toBe(0);
  });
  test('rearming the same kind also invalidates the old cleanup', () => {
    const f = fixture(), first = toolExit(f.host, 'draw-ink', f.finished);
    first(); const second = toolExit(f.host, 'draw-ink', f.finished); f.drain();
    expect(f.host.toolName()).toBe('draw-ink'); expect(f.exits()).toBe(0);
    second(); f.drain(); expect(f.host.toolName()).toBeNull(); expect(f.exits()).toBe(1);
  });
});
