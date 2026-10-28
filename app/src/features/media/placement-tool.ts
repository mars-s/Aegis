import { CardIdSchema } from '@aegis/domain/schema';
import type { CanvasEngine, SceneTool } from '@aegis/scene';
import type { FeatureWorkspace } from '../../composition.js';
import { toolExit } from '../../platform/tool-lifetime.js';
import { requestCardEdit } from './creation-edit.js';

export function mediaPlacementTool(engine: CanvasEngine, workspace: FeatureWorkspace, type: 'swatch' | 'link' | 'audio' | 'video'): SceneTool {
  const release = toolExit(engine, `place-${type}`);
  let active = true;
  const exit = () => { active = false; release(); };
  let pressed: number | null = null;
  const dimensions = type === 'swatch' ? { w: 160, h: 160 } : type === 'link' ? { w: 260, h: 130 } : type === 'audio' ? { w: 360, h: 300 } : { w: 440, h: 470 };
  return {
    id: `place-${type}`,
    accepts: point => active && point.button === 0,
    down: point => { if (active) pressed = point.pointerId; },
    move: points => {
      const point = points.at(-1); if (!active || !point) return;
      engine.preview({ cursor: 'crosshair', primitives: [{ kind: 'rect', space: 'world', opacity: .6, bounds: { ...point.world, width: dimensions.w, height: dimensions.h }, radius: 8, fill: null, stroke: { colour: { kind: 'theme', token: 'focus' }, width: 1.5, dash: [] } }] });
    },
    up: point => {
      if (!active || pressed !== point.pointerId) return;
      pressed = null;
      const id = CardIdSchema.parse(crypto.randomUUID().replaceAll('-', '').slice(0, 16));
      if (type === 'swatch' || type === 'link') engine.afterInput(() => requestCardEdit(workspace, id));
      engine.commitTool({ commands: [{ op: 'create', newId: id, type, ...point.world, ...dimensions, ...(type === 'audio' || type === 'video' ? { text: type === 'video' ? 'Camera recording' : 'Voice memo', props: { ready: true, shape: 'wide' } } : {}) }], selection: [id] });
      engine.preview(null); exit();
    },
    acceptsKey: key => key.key === 'Escape',
    key: () => { pressed = null; engine.preview(null); exit(); },
    cancel: () => { pressed = null; engine.preview(null); },
  };
}
