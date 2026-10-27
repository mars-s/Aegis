import { useEffect, useState } from 'react';
import type { CardBodyProps } from '../../composition.js';
import { useCard } from '../../workspace/index.js';
import { ColourEditor } from '../../features/colours/ColourEditor.js';
import { colorName, normHex } from '../../features/colours/model.js';
import { SwatchProps } from './props.js';
import { takeCardEdit } from '../../features/media/creation-edit.js';
export function SwatchBody({ cardId, workspace }: CardBodyProps) {
  const card = useCard(workspace, cardId), [open, setOpen] = useState(false);
  useEffect(() => { if (takeCardEdit(workspace, cardId)) setOpen(true); }, [workspace, cardId]);
  if (!card) return null;
  const props = SwatchProps.parse(card.props ?? {}), hex = normHex(props.hex) ?? '#ff9ec4';
  return <><button className="swatch-chip" style={{ background: hex }} aria-label="Change colour" onClick={() => setOpen(true)} />{!props.hideName && <strong className="swatch-name" onDoubleClick={() => setOpen(true)}>{props.role && props.autoName ? props.role : props.label || colorName(hex)}</strong>}{!props.hideHex && <small>{hex.toUpperCase()}</small>}
    {open && <ColourEditor value={{ hex, label: props.label || colorName(hex), autoName: props.autoName }} board={workspace.scene.snapshot} onClose={() => setOpen(false)} onChange={value => workspace.submit([{ op: 'update', id: cardId, set: { props: { ...value } } }])} onSave={value => workspace.submit([{ op: 'board_set', set: { palette: [...(workspace.scene.snapshot().palette ?? []).filter(row => row.hex !== value.hex), value] } }])} swatch={{ hideName: props.hideName, hideHex: props.hideHex, toggle: (key, value) => workspace.submit([{ op: 'update', id: cardId, set: { props: { [key]: value } } }]) }} />}</>;
}
