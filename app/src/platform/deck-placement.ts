import type { ToolPointer } from '@aegis/scene';
import type { FeatureContext } from '../composition.js';
import { placeDeck } from '../cards/deck/index.js';
import { toolExit } from './tool-lifetime.js';

export function armDeckPlacement(context: FeatureContext): void {
  const engine = context.engine(); if (!engine) return;
  const release = toolExit(engine, 'place-deck');
  let active = true;
  const finish = (): void => { active = false; engine.preview(null); release(); };
  const point = (at: ToolPointer): void => {
    if (!active) return;
    engine.preview({ cursor: 'crosshair', primitives: [{ kind: 'rect', opacity: .6, space: 'world', bounds: { x: at.world.x - 235, y: at.world.y - 176, width: 470, height: 352 }, radius: 8, fill: null, stroke: { colour: { kind: 'theme', token: 'focus' }, width: 1, dash: [] } }] });
  };
  engine.tool({ id: 'place-deck', accepts: at => active && at.button === 0, down: point, move: points => { const at = points.at(-1); if (at) point(at); }, up: at => {
    if (!active) return;
    engine.afterInput(() => placeDeck(context, at.world)); finish();
  }, acceptsKey: key => key.key === 'Escape', key: finish, cancel: finish });
}
