import { describe, expect, test } from 'vitest';
import { ToolController } from '../../../packages/scene/src/tools.js';
import type { SceneTool, ToolPointer } from '@aegis/scene';

const pointer = (time: number, pressure = 0.5): ToolPointer => ({ pointerId: 7, pointerType: 'pen', screen: { x: 100, y: 80 }, world: { x: 50, y: 40 }, pressure, time, button: 0, buttons: 1, shift: false, alt: false, bypass: false });
function fixture() {
  let invalidations = 0;
  const controller = new ToolController(() => { invalidations++; }, () => null);
  const events: (string | readonly ToolPointer[])[] = [];
  const tool: SceneTool = {
    accepts: point => point.button === 0,
    down: point => events.push(`down:${point.time}`), move: points => events.push(points), up: point => events.push(`up:${point.time}`),
    acceptsKey: key => key.key === 'Enter', key: key => events.push(key.key), cancel: reason => events.push(reason),
  };
  controller.set(tool);
  return { controller, events, invalidations: () => invalidations };
}
describe('continuous tool input', () => {
  test('queues original coalesced samples and the final up without invoking feature code in a DOM adapter', () => {
    const { controller, events, invalidations } = fixture();
    const samples = [pointer(2, 0.3), pointer(3, 0.8)];
    expect(controller.down(pointer(1))).toBe(true);
    controller.move(samples); controller.up(pointer(4));
    expect(events).toEqual([]);
    controller.flush();
    expect(events).toEqual(['down:1', samples, 'up:4']);
    expect(invalidations()).toBeGreaterThan(0);
    expect(controller.owns(7)).toBe(false);
  });
  test('keeps a multi-click tool armed and only captures keys its predicate accepts', () => {
    const { controller, events } = fixture();
    controller.down(pointer(1)); controller.up(pointer(2)); controller.flush();
    expect(controller.down(pointer(3))).toBe(true);
    expect(controller.key({ key: 'x', shift: false, alt: false, bypass: false })).toBe(false);
    expect(controller.key({ key: 'Enter', shift: false, alt: false, bypass: false })).toBe(true);
    controller.flush();
    expect(events).toEqual(['down:1', 'up:2', 'down:3', 'Enter']);
  });
  test('board replacement drops queued input and old finish callbacks and cancels exactly once', () => {
    const { controller, events } = fixture();
    controller.down(pointer(1)); controller.cancel('tool-change');
    controller.reset('board-change'); controller.flush(); controller.flush();
    expect(events).toEqual(['board-change']);
    expect(controller.down(pointer(3))).toBe(false);
    expect(controller.getPreview()).toBeNull();
  });
});
