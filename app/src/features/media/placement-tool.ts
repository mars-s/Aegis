import { CardIdSchema } from '@aegis/domain/schema';
import type { CanvasEngine, SceneTool } from '@aegis/scene';
import type { FeatureWorkspace } from '../../composition.js';
import { toolExit } from '../../platform/tool-lifetime.js';
import { requestCardEdit } from './creation-edit.js';

export function mediaPlacementTool(engine: CanvasEngine, workspace: FeatureWorkspace, type: 'swatch' | 'audio' | 'video'): SceneTool {
  const exit = toolExit(engine, `place-${type}`);
  let pressed: number | null = null;
  return {
    id: `place-${type}`,
    accepts: point => point.button === 0,
    down: point => { pressed = point.pointerId; },
    move: points => {
      const point = points.at(-1); if (!point) return;
      engine.preview({ cursor: 'crosshair', primitives: [{ kind: 'rect', space: 'world', opacity: .6, bounds: { ...point.world, width: type === 'swatch' ? 160 : 440, height: type === 'swatch' ? 160 : 320 }, radius: 8, fill: null, stroke: { colour: { kind: 'theme', token: 'focus' }, width: 1.5, dash: [] } }] });
    },
    up: point => {
      if (pressed !== point.pointerId) return;
      pressed = null;
      const id = CardIdSchema.parse(crypto.randomUUID().replaceAll('-', '').slice(0, 16));
      if (type === 'swatch') engine.afterInput(() => requestCardEdit(workspace, id));
      engine.commitTool({ commands: [{ op: 'create', newId: id, type, ...point.world }], selection: [id] });
      engine.preview(null); exit();
    },
    acceptsKey: key => key.key === 'Escape',
    key: () => { pressed = null; engine.preview(null); exit(); },
    cancel: () => { pressed = null; engine.preview(null); },
  };
}
