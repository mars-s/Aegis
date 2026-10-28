import { CardIdSchema } from '@aegis/domain';
import { requestCardEdit, takeCardEdit } from '../media/creation-edit.js';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent, CSSProperties } from 'react';
import type { FeatureContext } from '../../composition.js';
import { createMenu } from '../../lib/ui/menu.js';
import { ColourEditor } from './ColourEditor.js';
import type { ColourValue } from './ColourEditor.js';
import { boardColours, colorName } from './model.js';
const paletteStyle = (hex: string): CSSProperties & { '--palette-colour': string } => ({ '--palette-colour': hex });
export function BoardColours({ context }: { readonly context: FeatureContext }) {
  const { workspace } = context;
  const subscribe = useCallback((listener: () => void) => workspace.scene.subscribe(() => listener()), [workspace]), board = useSyncExternalStore(subscribe, workspace.scene.snapshot);
  const [edit, setEdit] = useState<{ kind: 'palette'; hex: string; name: string } | { kind: 'background' } | null>(null), closeMenu = useRef<(() => void) | null>(null), originalHex = useRef('');
  useEffect(() => () => { closeMenu.current?.(); }, [board.id]);
  const add = (hex = '#ff9ec4', name?: string, edit = false) => {
    const at = context.engine()?.screenToWorld({ x: innerWidth / 2, y: innerHeight / 2 }) ?? { x: 0, y: 0 };
    const id = CardIdSchema.parse(crypto.randomUUID().replaceAll('-', '').slice(0, 16));
    if (edit) requestCardEdit(workspace, id);
    const result = workspace.submit([{ op: 'create', newId: id, type: 'swatch', x: at.x, y: at.y, props: { hex, label: name ?? colorName(hex), autoName: !name } }]);
    if (result.kind === 'applied') workspace.act({ kind: 'select', ids: [id] });
    else if (edit) takeCardEdit(workspace, id);
  };
  function change(value: ColourValue) {
    if (edit?.kind === 'background') { workspace.submit([{ op: 'board_set', set: { bg: value.hex } }]); return; }
    const current = workspace.scene.snapshot(), old = originalHex.current;
    workspace.submit([{ op: 'board_set', set: { palette: (current.palette ?? []).map(row => row.hex === old ? { hex: value.hex, name: value.label } : row) } }, ...current.cards.filter(card => card.type === 'swatch' && card.props?.hex === old).map(card => ({ op: 'update' as const, id: card.id, set: { props: { hex: value.hex, label: value.label, autoName: false } } }))]); originalHex.current = value.hex;
  }
  const remove = (hex: string) => workspace.submit([{ op: 'board_set', set: { palette: (workspace.scene.snapshot().palette ?? []).filter(row => row.hex !== hex) } }]);
  const editPalette = (hex: string, name: string) => { originalHex.current = hex; setEdit({ kind: 'palette', hex, name }); };
  function menu(event: MouseEvent<HTMLDivElement>, hex: string, name: string) {
    const trigger = event.currentTarget.querySelector('button'); if (!trigger) return;
    event.preventDefault(); event.stopPropagation(); closeMenu.current?.();
    const element = document.createElement('div'); element.className = 'palette-menu'; document.body.append(element);
    const popup = createMenu({ trigger, menu: element, label: 'Palette colour', bindTrigger: false, items: [{ title: 'Add to the board', run: () => add(hex, name) }, { title: 'Rename', run: () => { editPalette(hex, name); queueMicrotask(() => { const input = document.querySelector('.colour-pop input[aria-label="Colour name"]'); if (input instanceof HTMLInputElement) { input.focus(); input.select(); } }); } }, { title: 'Change colour…', run: () => editPalette(hex, name) }, { title: 'Remove from board colours', destructive: true, run: () => remove(hex) }], onToggle: open => { if (!open) { element.remove(); } } });
    closeMenu.current = () => { popup.destroy(); element.remove(); }; popup.open(event.nativeEvent, { x: event.clientX, y: event.clientY });
  }
  const used = boardColours(board);
  return <section className="board-colours" aria-label="Board colours"><div className="colour-actions"><button onClick={() => add(undefined, undefined, true)}>Add colour</button><button onClick={() => setEdit({ kind: 'background' })}>Background</button>{board.bg && <button onClick={() => workspace.submit([{ op: 'board_set', set: { bg: null } }])}>Default background</button>}</div><small>Saved palette</small>{!board.palette?.length && <p className="muted">Save a swatch here from its colour editor.</p>}
    {(board.palette ?? []).map(row => <div key={row.hex} className="palette-row" onContextMenu={event => menu(event, row.hex, row.name)}><button style={paletteStyle(row.hex)} title={row.hex} onClick={() => add(row.hex, row.name)}>{row.name}</button><button onClick={() => editPalette(row.hex, row.name)}>Edit</button><button aria-label={`Remove ${row.name} from board colours`} onClick={() => remove(row.hex)}>×</button></div>)}{used.length ? <><small>Colours in use</small><div className="colour-quick">{used.map(row => <button key={row.hex} className="colour-swatch" data-hex={row.hex} aria-label={row.name} title={`${row.name} ${row.hex}`} style={{ background: row.hex }} onClick={() => add(row.hex, row.name)} />)}</div></> : null}
    {edit && <ColourEditor board={workspace.scene.snapshot} value={edit.kind === 'palette' ? { hex: edit.hex, label: edit.name, autoName: false } : { hex: board.bg || '#ffffff', label: '', autoName: false }} name={edit.kind !== 'background'} onChange={change} onClose={() => setEdit(null)} />}
  </section>;
}
