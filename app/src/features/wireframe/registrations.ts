import type { ActionRegistration, FeatureContext } from '../../composition.js';
import { sectionCommands } from './commands.js';
import { placementTool } from './tool.js';

export function createWireframeSection(context: FeatureContext): void {
  const workspace = context.workspace, ids = new Set(workspace.selection.getSnapshot());
  const cards = workspace.scene.snapshot().cards.filter(card => ids.has(card.id));
  if (!cards.length) return;
  const result = workspace.submit(sectionCommands(cards));
  if (result.kind === 'applied') workspace.act({ kind: 'select', ids: result.ids });
}

export function wireframeActions(open: () => void): readonly ActionRegistration[] {
  const place = (kind: 'box' | 'text') => (context: FeatureContext): void => {
    const engine = context.engine(); if (!engine) return;
    open(); engine.tool(placementTool(engine, context.workspace, { kind }));
  };
  return [
    { id: 'wireframe.section', label: 'Create section', shortcut: 'mod+alt+g', run: context => { createWireframeSection(context); open(); } },
    { id: 'wireframe.text', label: 'Wireframe text', shortcut: 'x', run: place('text') },
    { id: 'wireframe.box', label: 'Wireframe box', shortcut: 'shift+r', run: place('box') },
  ];
}
