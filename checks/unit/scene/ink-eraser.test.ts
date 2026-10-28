import { expect, it } from 'vitest';
import type { CanvasEngine, ToolCommit, ToolPointer } from '@aegis/scene';
import { drawingTool } from '../../../app/src/features/draw/tool.ts';
import { readPreferences } from '../../../app/src/features/draw/preferences.ts';
import { createWorkspace } from '../../../app/src/workspace/store.ts';
import { boardWith } from '../workspace/helpers.ts';

function erase(points: readonly { x: number; y: number }[], zoom = 1) {
  const commits: ToolCommit[] = [];
  const engine: Pick<CanvasEngine, 'afterInput' | 'tool' | 'toolName' | 'camera' | 'preview' | 'commitTool'> = {
    afterInput: run => run(), tool: () => {}, toolName: () => 'draw-ink',
    camera: () => ({ x: 0, y: 0, zoom }), preview: () => {}, commitTool: value => { commits.push(value); },
  };
  const workspace = createWorkspace({ board: boardWith([{ op: 'create', newId: 'rotatedink', type: 'ink', x: 20, y: 20, w: 200, h: 100, rot: 90, props: { points: [[0, 50, 0], [100, 50, 1]], ow: 100, oh: 100, size: 4 } }]) });
  const tool = drawingTool(engine, workspace, 'ink', () => ({ ...readPreferences(), pen: 'eraser', shape: 'rect', fill: 'none', stroke: 'ink', sw: 2, sdash: 'solid', dl: 8, dg: 6, emoji: '⭐' }), () => {});
  const event = (world: { x: number; y: number }): ToolPointer => ({ pointerId: 1, pointerType: 'mouse', world, screen: world, pressure: 0.5, time: 1, button: 0, buttons: 1, shift: false, alt: false, bypass: false });
  const first = points[0], last = points.at(-1);
  if (!first || !last) throw new Error('Missing eraser gesture');
  tool.down?.(event(first));
  tool.up?.(event(last));
  workspace.dispose();
  return commits.flatMap(commit => commit.commands);
}

it('erases the actual resized and rotated stroke beyond its unrotated rectangle', () => {
  expect(erase([{ x: 120, y: 160 }])).toEqual([{ op: 'delete', ids: ['rotatedink'] }]);
});

it('keeps empty pixels inside the unrotated rectangle', () => {
  expect(erase([{ x: 30, y: 30 }])).toEqual([]);
});

it('includes the final pointer segment even when no move sample reached the tool', () => {
  expect(erase([{ x: 0, y: 160 }, { x: 250, y: 160 }])).toEqual([{ op: 'delete', ids: ['rotatedink'] }]);
});

it('keeps the eraser radius in screen pixels as the camera zoom changes', () => {
  expect(erase([{ x: 132, y: 160 }], 4)).toEqual([]);
  expect(erase([{ x: 132, y: 160 }], 0.5)).toEqual([{ op: 'delete', ids: ['rotatedink'] }]);
});
