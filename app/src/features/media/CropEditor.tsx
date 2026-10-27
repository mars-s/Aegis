import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { MediaDialog } from './MediaDialog.js';
import '../../lib/ui/stepper.css';
import { clamp, cropBox } from './image-utils.js';
import type { Crop, CropHandle } from './image-utils.js';
function PixelInput({ label, value, min, max, disabled, commit, apply }: { readonly label: string; readonly value: number; readonly min: number; readonly max: number; readonly disabled: boolean; readonly commit: (value: number) => Crop; readonly apply: (crop: Crop) => void }) {
  const [draft, setDraft] = useState(String(value)), focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(String(value)); }, [value]);
  const current = () => clamp(focused.current && Number.isFinite(Number(draft)) ? Number(draft) : value, min, max);
  function step(amount: number): void {
    const next = clamp(current() + amount, min, max); setDraft(String(next)); commit(next);
  }
  return <span className="aegis-stepper" role="group" aria-label={`${label} adjustment`}>
    <button type="button" tabIndex={-1} aria-label={`Decrease ${label.toLowerCase()}`} disabled={disabled || current() <= min} onPointerDown={event => event.preventDefault()} onClick={() => step(-1)}>−</button>
    <input aria-label={label} type="number" step={1} min={min} max={max} disabled={disabled} value={focused.current ? draft : String(value)} onFocus={() => { focused.current = true; setDraft(String(value)); }} onChange={event => setDraft(event.currentTarget.value)} onBlur={() => { const next = current(); focused.current = false; setDraft(String(next)); commit(next); }} onKeyDown={event => {
    if (event.key === 'Enter') { event.preventDefault(); const next = current(); setDraft(String(next)); apply(commit(next)); }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); const next = clamp(current() + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1), min, max); setDraft(String(next)); commit(next); }
  }} />
    <button type="button" tabIndex={-1} aria-label={`Increase ${label.toLowerCase()}`} disabled={disabled || current() >= max} onPointerDown={event => event.preventDefault()} onClick={() => step(1)}>+</button>
  </span>;
}
export function CropEditor({ src, label, initial, onApply, onClose }: { readonly src: string; readonly label: string; readonly initial: Crop | null; readonly onApply: (crop: Crop, width: number, height: number) => void; readonly onClose: () => void }) {
  const [crop, setCrop] = useState<Crop>(initial ?? { x: 0, y: 0, w: 1, h: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 }), [error, setError] = useState('');
  const frame = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; y: number; width: number; height: number; crop: Crop } | null>(null);
  const min = { w: Math.ceil(size.w * .08), h: Math.ceil(size.h * .08) };
  const geometry = { x: Math.round(crop.x * size.w), y: Math.round(crop.y * size.h), w: Math.round(crop.w * size.w), h: Math.round(crop.h * size.h) };
  function rounded(box: Crop): Crop {
    const w = clamp(Math.round(box.w * size.w), min.w, size.w), h = clamp(Math.round(box.h * size.h), min.h, size.h);
    return { x: clamp(Math.round(box.x * size.w), 0, size.w - w) / size.w, y: clamp(Math.round(box.y * size.h), 0, size.h - h) / size.h, w: w / size.w, h: h / size.h };
  }
  function start(event: PointerEvent<HTMLButtonElement>) {
    const bounds = frame.current?.getBoundingClientRect(); if (event.button !== 0 || !size.w || !bounds) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height, crop };
  }
  const region = { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` };
  const handles = [{ handle: 'move', label: 'Crop area' }, { handle: 'nw', label: 'Top-left crop handle' }, { handle: 'ne', label: 'Top-right crop handle' }, { handle: 'sw', label: 'Bottom-left crop handle' }, { handle: 'se', label: 'Bottom-right crop handle' }] as const;
  return <MediaDialog label="Crop image" className="crop-dialog" onClose={onClose}><div className="crop-preview"><div ref={frame} className="crop-frame"><img src={src} alt={label || 'Image to crop'} draggable={false} onLoad={event => setSize({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })} onError={() => setError('Could not load this image. Cancel and try again.')} /><div className="crop-shade" aria-hidden="true"><div style={region} /></div>
    {handles.map(({ handle, label: controlLabel }) => <button key={handle} tabIndex={0} className={handle === 'move' ? 'crop-box' : `crop-handle ${handle}`} aria-label={controlLabel} aria-describedby="crop-help" data-handle={handle} style={handle === 'move' ? region : { left: `${(crop.x + (handle.includes('e') ? crop.w : 0)) * 100}%`, top: `${(crop.y + (handle.includes('s') ? crop.h : 0)) * 100}%` }}
      onPointerDown={start} onPointerMove={event => { const from = drag.current; if (!from || !event.currentTarget.hasPointerCapture(event.pointerId)) return; setCrop(rounded(cropBox(from.crop, handle, (event.clientX - from.x) / from.width, (event.clientY - from.y) / from.height, { w: min.w / size.w, h: min.h / size.h }))); }} onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onApply(rounded(crop), size.w, size.h); return; } const direction = new Map<string, readonly [number, number]>([['ArrowLeft', [-1, 0]], ['ArrowRight', [1, 0]], ['ArrowUp', [0, -1]], ['ArrowDown', [0, 1]]]).get(event.key); if (!direction || !size.w) return; event.preventDefault(); const step = event.shiftKey ? 10 : 1; setCrop(current => rounded(cropBox(current, handle, direction[0] * step / size.w, direction[1] * step / size.h, { w: min.w / size.w, h: min.h / size.h }))); }} />)}
  </div></div><p id="crop-help" className="crop-help">Arrow keys move the area or resize a corner by 1 pixel. Hold Shift for 10 pixels. All values use the original image.</p>
    <div className="crop-fields">{([{ key: 'x', name: 'X', max: size.w - geometry.w, min: 0, scale: size.w }, { key: 'y', name: 'Y', max: size.h - geometry.h, min: 0, scale: size.h }, { key: 'w', name: 'Width', max: size.w - geometry.x, min: min.w, scale: size.w }, { key: 'h', name: 'Height', max: size.h - geometry.y, min: min.h, scale: size.h }] as const).map(field => <label className="crop-field" key={field.key}>{field.name}<PixelInput label={field.name} min={field.min} max={field.max} value={geometry[field.key]} disabled={!size.w} commit={value => { const next = rounded({ ...crop, [field.key]: value / field.scale }); setCrop(next); return next; }} apply={next => onApply(next, size.w, size.h)} /></label>)}</div>
    <p className="crop-status" role="status" aria-atomic="true">{error || (size.w ? `X ${geometry.x}, Y ${geometry.y}, width ${geometry.w}, height ${geometry.h} pixels.` : 'Loading image…')}</p><div className="media-actions"><button tabIndex={0} onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })}>Reset</button><button tabIndex={0} onClick={onClose}>Cancel</button><button tabIndex={0} disabled={!size.w} onClick={() => onApply(rounded(crop), size.w, size.h)}>Done</button></div>
  </MediaDialog>;
}
export type { CropHandle };
