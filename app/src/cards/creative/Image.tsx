import { useState } from 'react';
import type { CardBodyProps } from '../../composition.js';
import { useCard } from '../../workspace/index.js';
import { paletteFromPixels } from '../../features/colours/model.js';
import { useCreativeServices } from '../../features/media/services.js';
import { CropEditor } from '../../features/media/CropEditor.js';
import { MediaDialog } from '../../features/media/MediaDialog.js';
import { ImageProps } from './props.js';
import '../../features/media/style.css';
export function ImageBody({ cardId, workspace, engine }: CardBodyProps) {
  const services = useCreativeServices(), card = useCard(workspace, cardId), [editor, setEditor] = useState<'crop' | 'caption' | null>(null), [caption, setCaption] = useState('');
  if (!card) return null;
  const props = ImageProps.parse(card.props ?? {}), boardId = workspace.metadata.getSnapshot().id, crop = props.crop;
  const close = () => { setEditor(null); engine.pin(cardId, 'dirty', false); };
  async function pullColours() {
    try {
      const image = new Image(); image.crossOrigin = 'anonymous'; image.src = services.assetUrl(card?.url); await image.decode();
      const canvas = document.createElement('canvas'), scale = 100 / Math.max(image.naturalWidth, image.naturalHeight); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('Could not read image colours');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const colours = paletteFromPixels(context.getImageData(0, 0, canvas.width, canvas.height).data), current = workspace.record(cardId).getSnapshot();
      if (workspace.metadata.getSnapshot().id !== boardId || !current) return;
      const roles = ['main', 'second', 'accent', 'shadow', 'pop'];
      workspace.submit(colours.map((hex, i) => ({ op: 'create', type: 'swatch', x: current.x + current.w + 30 + i * 180, y: current.y + (i % 2) * 18, props: { hex, label: roles[i] ?? 'Colour', role: roles[i] ?? 'Colour', autoName: false } })));
      services.notify(`Pulled ${colours.length} colours from the image`);
    } catch (error) { services.notify(`Could not read image colours. ${error instanceof Error ? error.message : String(error)}`); }
  }
  return <><div className="image-viewport"><img src={services.assetUrl(card.url)} alt={props.tagText || card.text || 'Image'} decoding="async" loading="lazy" draggable={false} style={crop ? { position: 'absolute', width: `${100 / crop.w}%`, height: `${100 / crop.h}%`, maxWidth: 'none', left: `${-100 * crop.x / crop.w}%`, top: `${-100 * crop.y / crop.h}%`, objectFit: 'fill' } : undefined} /></div>{props.tagText && <div className="image-caption">{props.tagText}</div>}
    <div className="media-actions image-actions"><button onClick={() => void pullColours()}>Pull colours</button><button onClick={() => { engine.pin(cardId, 'dirty', true); setEditor('crop'); }}>Crop</button><button onClick={() => { setCaption(props.tagText); engine.pin(cardId, 'dirty', true); setEditor('caption'); }}>Caption</button></div>
    {editor === 'crop' && <CropEditor src={services.assetUrl(card.url)} label={card.text} initial={crop} onClose={close} onApply={(next, width, height) => { const current = workspace.record(cardId).getSnapshot(); if (current && workspace.metadata.getSnapshot().id === boardId) workspace.submit([{ op: 'update', id: cardId, set: { props: { crop: next.w === 1 && next.h === 1 ? null : { ...next } }, h: Math.max(60, current.w * height * next.h / (width * next.w) + (props.tagText ? 28 : 0)) } }]); close(); }} />}
    {editor === 'caption' && <MediaDialog label="Image caption" onClose={close}><label className="media-field">Caption<input aria-label="Caption" value={caption} onChange={event => setCaption(event.currentTarget.value)} /></label><button onClick={() => { if (workspace.metadata.getSnapshot().id === boardId) workspace.submit([{ op: 'update', id: cardId, set: { props: { tagText: caption || null } } }]); close(); }}>Save caption</button><button onClick={close}>Cancel</button></MediaDialog>}
  </>;
}
