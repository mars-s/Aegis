import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BoardIdSchema } from '@aegis/domain';
import type { BoardId } from '@aegis/domain';
import type { ToolPointer } from '@aegis/scene';
import type { CardBodyProps, FeatureContext } from '../composition.js';
import { useCard, useSource } from '../workspace/index.js';
import { toolExit } from '../platform/tool-lifetime.js';
import { BoardPreview } from './BoardPreview.js';
import type { LibraryService } from './library-model.js';
import type { Notify } from './actions.js';

export const CanvasLibrary = createContext<LibraryService | null>(null);

export function CanvasBody({ workspace, cardId }: CardBodyProps) {
  const library = useContext(CanvasLibrary), card = useCard(workspace, cardId);
  const parsed = BoardIdSchema.safeParse(card?.props?.board);
  return library && parsed.success ? <CanvasContent library={library} board={parsed.data} title={card?.text ?? 'Canvas'} /> : <p>Canvas unavailable</p>;
}
function CanvasContent({ library, board, title }: { readonly library: LibraryService; readonly board: BoardId; readonly title: string }) {
  const child = useSource(library.source).boards.find(item => item.id === board);
  const [failure, setFailure] = useState('');
  const name = useRef<HTMLDivElement>(null);
  const value = child?.name ?? title;
  useEffect(() => { if (name.current && document.activeElement !== name.current) name.current.textContent = value; }, [value]);
  const open = (): void => { void library.open(board).catch(() => setFailure('Could not open canvas.')); };
  return <div className="canvas-card">
    <div className="canvas-preview" onDoubleClick={event => { event.stopPropagation(); open(); }}><BoardPreview service={library} board={board} /></div>
    <button type="button" className="canvas-open" aria-label="Open canvas" onClick={event => { event.stopPropagation(); open(); }}>Open canvas</button>
    <div ref={name} className="canvas-title" contentEditable="plaintext-only" suppressContentEditableWarning role="textbox" aria-label="Canvas name" onDoubleClick={event => event.stopPropagation()} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault(); if (event.key === 'Escape') event.currentTarget.textContent = value;
        event.currentTarget.blur();
      }
    }} onBlur={event => {
      const next = event.currentTarget.textContent?.trim();
      if (next && next !== value && child) void library.rename({ ...child, item: 'board' }, next).catch(() => setFailure('Could not rename canvas.'));
    }} />
    {failure ? <p role="status">{failure}</p> : null}
  </div>;
}

export function armCanvasPlacement(context: FeatureContext, library: LibraryService, notify: Notify): void {
  const engine = context.engine(); if (!engine) return;
  const parent = context.workspace.metadata.getSnapshot().id;
  const release = toolExit(engine, 'canvas');
  let active = true;
  const finish = (): void => { active = false; engine.preview(null); release(); };
  const point = (at: ToolPointer): void => {
    if (active) engine.preview({ cursor: 'crosshair', primitives: [{ kind: 'rect', opacity: .6, space: 'world', bounds: { x: at.world.x, y: at.world.y, width: 300, height: 220 }, radius: 8, fill: null, stroke: { colour: { kind: 'theme', token: 'focus' }, width: 1, dash: [] } }] });
  };
  engine.tool({ id: 'canvas', accepts: at => active && at.button === 0, down: point, move: points => { const at = points.at(-1); if (at) point(at); }, up: at => {
    if (!active) return;
    engine.afterInput(() => { void library.createChild(parent, at.world).catch(cause => notify({ text: cause instanceof Error ? cause.message : 'Could not create canvas.' })); }); finish();
  }, acceptsKey: key => key.key === 'Escape', key: finish, cancel: finish });
}

export function BoardCrumbs({ library, current }: { readonly library: LibraryService; readonly current: BoardId }) {
  const boards = useSource(library.source).boards;
  const chain = [], seen = new Set<BoardId>([current]);
  let board = boards.find(item => item.id === current);
  while (board?.boardParent && !seen.has(board.boardParent)) {
    seen.add(board.boardParent); const parent = boards.find(item => item.id === board?.boardParent);
    if (!parent) break;
    chain.unshift(parent); board = parent;
  }
  return chain.map(item => <button key={item.id} type="button" onClick={() => { void library.open(item.id); }}>{item.name}</button>);
}
