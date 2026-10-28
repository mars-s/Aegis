import { CommandSchema } from '@aegis/domain/schema';
import type { Command } from '@aegis/domain/schema';
import type { CanvasEngine, SceneTool, ToolPointer } from '@aegis/scene';
import type { FeatureWorkspace } from '../../composition.js';
import { toolExit } from '../../platform/tool-lifetime.js';
import { requestCardEdit } from '../media/creation-edit.js';
import { frameAt, pieceCommands, screenCommand, wireCard } from './commands.js';
import type { WirePlacement } from './WireframePanel.js';
const stroke = () => ({ colour: { kind: 'theme', token: 'text' }, width: 1.5, dash: [] } as const);
export function placementTool(engine: CanvasEngine, workspace: FeatureWorkspace, request: WirePlacement): SceneTool {
  const release = toolExit(engine, 'wireframe');
  let active = true;
  const exit = () => { active = false; release(); };
  let start: ToolPointer | null = null;
  const commandsAt = (point: ToolPointer): readonly Command[] => {
    const grid = localStorage.getItem('aegis:wireframe-grid') === 'on' && !point.bypass;
    const at = grid ? { x: Math.round(point.world.x / 26) * 26, y: Math.round(point.world.y / 26) * 26 } : point.world;
    if (request.kind === 'screen') return [screenCommand(request.device, at)];
    if (request.kind === 'piece') return pieceCommands(request.name, at, workspace.scene.snapshot().cards);
    if (request.kind === 'text') return [wireCard({ type: 'text', text: 'Type something', w: 240, h: 28, font: 'Arial', size: 18, weight: 500, color: '#27272a' }, at.x, at.y)];
    if (request.kind === 'font') return [wireCard({ type: 'font', text: 'The quick brown fox jumps over the lazy dog.', w: 320, h: 190, font: 'Georgia' }, at.x, at.y)];
    if (request.kind === 'icon') return [wireCard({ type: 'icon', name: request.name, w: 40, h: 40, color: '#27272a' }, at.x, at.y)];
    return [wireCard(request.kind === 'section' ? { type: 'section', text: 'Section', w: 560, h: 360, fill: '#cbd5e1', radius: 24 } : { type: 'box', w: 160, h: 100, fill: '#e4e4e7', radius: 8, sw: 0 }, at.x, at.y)];
  };
  return { id: 'wireframe', accepts: point => active && point.button === 0, down: point => { if (active) start = point; }, move: points => {
    if (!active) return;
    const point = points.at(-1); if (!point) return; engine.preview({ cursor: 'crosshair', primitives: [{ kind: 'rect', opacity: .6, space: 'world', bounds: { x: start ? Math.min(start.world.x, point.world.x) : point.world.x, y: start ? Math.min(start.world.y, point.world.y) : point.world.y, width: start ? Math.max(40, Math.abs(point.world.x - start.world.x)) : 160, height: start ? Math.max(24, Math.abs(point.world.y - start.world.y)) : 100 }, radius: 4, fill: null, stroke: stroke() }] });
  }, up: point => {
    const initial = start; if (!active || !initial) return;
    const dragged = Math.hypot(point.screen.x - initial.screen.x, point.screen.y - initial.screen.y) > 4;
    const commands = commandsAt(dragged ? initial : point).map(command => {
      if (command.op !== 'create') return command;
      const sized = dragged && (request.kind === 'box' || request.kind === 'section') ? CommandSchema.parse({ ...command, x: Math.min(initial.world.x, point.world.x), y: Math.min(initial.world.y, point.world.y), w: Math.max(40, Math.abs(point.world.x - initial.world.x)), h: Math.max(24, Math.abs(point.world.y - initial.world.y)) }) : command;
      if (sized.op !== 'create' || sized.type === 'frame' || sized.type === 'section' || sized.parent) return sized;
      const parent = frameAt(workspace.scene.snapshot().cards, { x: sized.x ?? 0, y: sized.y ?? 0, w: sized.w ?? 160, h: sized.h ?? 100 });
      return parent ? CommandSchema.parse({ ...sized, parent: parent.id }) : sized;
    });
    const created = commands.flatMap(command => command.op === 'create' ? [command] : []);
    for (const command of created) if ((command.type === 'frame' || command.type === 'section') && command.newId) commands.push({ op: 'order', id: command.newId, to: 'back' });
    const last = created.at(-1);
    const editId = request.kind === 'text' ? last?.newId : undefined;
    if (editId) engine.afterInput(() => requestCardEdit(workspace, editId));
    engine.commitTool({ commands, selection: commands.flatMap(command => command.op === 'create' && command.newId ? [command.newId] : []) }); engine.preview(null); start = null;
    exit();
  }, acceptsKey: key => key.key === 'Escape', key: () => { engine.preview(null); exit(); }, cancel: () => { start = null; engine.preview(null); } };
}
