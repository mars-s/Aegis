// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Board } from '@aegis/domain';
import { boardColours, colorName, hex2hsv, hsv2rgb, normHex, rgb2hex } from './model.js';
import './style.css';

export interface ColourValue { readonly hex: string; readonly label: string; readonly autoName: boolean }
interface EditorProps {
  readonly value: ColourValue;
  readonly board: () => Board;
  readonly onChange: (value: ColourValue) => void;
  readonly onClose: () => void;
  readonly onSave?: (value: { hex: string; name: string }) => void;
  readonly name?: boolean;
  readonly swatch?: { readonly hideName: boolean; readonly hideHex: boolean; readonly toggle: (key: 'hideName' | 'hideHex', value: boolean) => void };
}
// The editor is a modal portal. Key events stop here so React does not bubble them to the window that opened it.
export function ColourEditor({ value, board, onChange, onClose, onSave, name = true, swatch }: EditorProps) {
  const dialog = useRef<HTMLDialogElement>(null), wheel = useRef<HTMLCanvasElement>(null);
  // A card can carry a non-hex value such as "none" for no fill. The sliders cannot
  // show that, so start from black instead of NaN and let a real choice replace it.
  const start = normHex(value.hex) ?? '#000000';
  const [draft, setDraft] = useState(() => ({ ...value, hex: start })), [hsv, setHsv] = useState(() => hex2hsv(start));
  const [all, setAll] = useState(false);
  const help = useId(), latest = useRef(value), committed = useRef(value);
  function commit(next = latest.current) { if (next.hex === committed.current.hex && next.label === committed.current.label && next.autoName === committed.current.autoName) return; committed.current = next; onChange(next); }
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const context = wheel.current?.getContext('2d'); if (!context) return;
    const pixels = context.createImageData(220, 220);
    for (let y = 0; y < 220; y++) for (let x = 0; x < 220; x++) {
      const dx = x - 109.5, dy = y - 109.5, radius = Math.hypot(dx, dy); if (radius > 110) continue;
      pixels.data.set([...hsv2rgb((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, Math.min(1, radius / 110), 1), 255], (y * 220 + x) * 4);
    }
    context.putImageData(pixels, 0, 0);
  }, []);
  function change(next: ColourValue, nextHsv = hex2hsv(next.hex), publish = true) { latest.current = next; setDraft(next); setHsv(nextHsv); if (publish) commit(next); }
  function fromHSV(next: typeof hsv, publish = false) {
    const hex = rgb2hex(hsv2rgb(next.h, next.s, next.v));
    change({ ...draft, hex, label: draft.autoName ? board().palette?.find(row => row.hex === hex)?.name || colorName(hex) : draft.label }, next, publish);
  }
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect(), dx = event.clientX - bounds.left - bounds.width / 2, dy = event.clientY - bounds.top - bounds.height / 2;
    fromHSV({ ...hsv, h: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(dx, dy) / (bounds.width / 2)) });
  }
  const rows = [{ hex: '#000000', name: 'Black' }, { hex: '#ffffff', name: 'White' }, ...boardColours(board())].filter((row, i, list) => list.findIndex(p => p.hex === row.hex) === i);
  return <dialog ref={dialog} className="colour-pop" aria-label="Colour editor" data-over-popup="" onKeyDown={event => { event.stopPropagation(); }} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onClose={event => { event.stopPropagation(); onClose(); }}>
    <strong>Colour editor</strong>
    <div className="colour-wheel-wrap"><canvas ref={wheel} width={220} height={220} className="colour-wheel" role="slider" tabIndex={0} aria-label="Hue and saturation" aria-describedby={help} aria-valuemin={0} aria-valuemax={359} aria-valuenow={Math.round(hsv.h) % 360} aria-valuetext={`Hue ${Math.round(hsv.h)} degrees, saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%. ${draft.hex.toUpperCase()}`}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); point(event); event.preventDefault(); }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event); }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); commit(); }}
      onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); const delta = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1; fromHSV(event.shiftKey ? { ...hsv, s: Math.max(0, Math.min(1, hsv.s + delta * .02)) } : { ...hsv, h: (hsv.h + delta * 3 + 360) % 360 }, true); }} />
      <i className="colour-ring" style={{ left: 110 + Math.cos(hsv.h * Math.PI / 180) * hsv.s * 110, top: 110 + Math.sin(hsv.h * Math.PI / 180) * hsv.s * 110, background: draft.hex }} /></div>
    <p id={help} className="colour-instructions">Drag to choose hue and saturation. Arrow keys change hue. Shift + arrows change saturation. Brightness is separate.</p>
    <div className="colour-result"><i aria-hidden="true" style={{ background: draft.hex }} /><output aria-label="Selected colour">{draft.hex.toUpperCase()}</output></div>
    {([{ key: 'h', label: 'Hue', max: 359, factor: 1 }, { key: 's', label: 'Saturation', max: 100, factor: 100 }, { key: 'v', label: 'Brightness', max: 100, factor: 100 }] as const).map(row => <label className="media-field" key={row.key}>{row.label}<input aria-label={row.label} type="range" min={0} max={row.max} step={1} aria-valuetext={row.key === 'h' ? `${Math.round(hsv.h)} degrees` : `${Math.round(hsv[row.key] * 100)}% ${row.label.toLowerCase()}`} value={Math.round(hsv[row.key] * row.factor)} onChange={event => fromHSV({ ...hsv, [row.key]: Number(event.currentTarget.value) / row.factor })} onPointerUp={() => commit()} onKeyUp={() => commit()} onBlur={() => commit()} /><output>{Math.round(hsv[row.key] * row.factor)}{row.key === 'h' ? ' degrees' : '%'}</output></label>)}
    <label className="media-field">Hex<input aria-label="Hex" defaultValue={draft.hex.toUpperCase()} key={draft.hex} onBlur={event => { const hex = normHex(event.currentTarget.value); if (!hex) { event.currentTarget.setCustomValidity('Enter a three or six-digit hex colour'); event.currentTarget.reportValidity(); return; } event.currentTarget.setCustomValidity(''); change({ ...draft, hex, label: draft.autoName ? colorName(hex) : draft.label }); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
    {name && <label className="media-field">Colour name<input aria-label="Colour name" value={draft.label} onChange={event => change({ ...draft, label: event.currentTarget.value, autoName: false }, hsv)} /></label>}
    <div className="colour-quick">{(all ? rows : rows.slice(0, 16)).map(row => <button type="button" key={row.hex} className="colour-swatch" data-hex={row.hex} aria-label={row.name} title={row.name} aria-pressed={row.hex === draft.hex} style={{ background: row.hex }} onClick={() => change({ ...draft, hex: row.hex, label: draft.autoName ? row.name : draft.label })} />)}{rows.length > 16 && <button onClick={() => setAll(!all)}>{all ? 'Fewer' : 'All board colours'}</button>}</div>
    {swatch && (['hideName', 'hideHex'] as const).map(key => <label key={key} className="media-field"><input type="checkbox" checked={!swatch[key]} onChange={event => swatch.toggle(key, !event.currentTarget.checked)} />{key === 'hideName' ? 'Show name' : 'Show hex'}</label>)}
    {onSave && <button onClick={() => onSave({ hex: draft.hex, name: draft.label })}>Save to board colours</button>}
    <button onClick={onClose}>Done</button>
  </dialog>;
}
export function ColourPicker({ label, value, board, onChange }: { readonly label: string; readonly value: string; readonly board: () => Board; readonly onChange: (hex: string) => void }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return <><button type="button" className="aegis-button aegis-colour-picker" value={value} aria-label={label} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setContainer(event.currentTarget.closest('dialog') ?? document.body); }}><span className="aegis-colour-sample" aria-hidden="true" style={{ background: value }} /><span>{value.toUpperCase()}</span></button>{container && createPortal(<ColourEditor value={{ hex: value, label: colorName(value), autoName: true }} name={false} board={board} onChange={next => onChange(next.hex)} onClose={() => setContainer(null)} />, container)}</>;
}
