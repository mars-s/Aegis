import { useEffect, useRef } from 'react';
import type { CardBodyProps } from '../../composition.js';
import { useCard } from '../../workspace/index.js';
import { butter, centerline, colour, DrawingProps, InkProps, outlineAttributes, pathD, shapePoints, squigPath, StampProps } from '../../features/draw/art.js';
import '../../features/draw/draw.css';
import { beginPointEdit } from '../../features/draw/point-editor.js';

function ShapeText({ cardId, workspace, engine }: CardBodyProps) {
  const card = useCard(workspace, cardId), body = useRef<HTMLDivElement>(null);
  useEffect(() => { if (body.current && !body.current.isContentEditable) body.current.textContent = card?.text ?? ''; }, [card?.text]);
  if (!card) return null;
  const props = DrawingProps.parse(card.props ?? {}), fill = colour(props.fill, '#aed3ff');
  const rgb = /^#[0-9a-f]{6}$/i.test(fill) ? [parseInt(fill.slice(1, 3), 16), parseInt(fill.slice(3, 5), 16), parseInt(fill.slice(5, 7), 16)] : [];
  const [r = 255, g = 255, b = 255] = rgb;
  return <div ref={body} className="draw-text" data-scene-interactive="" aria-label="Text inside shape" role="textbox" tabIndex={0} style={{ color: rgb.length === 3 ? r * .299 + g * .587 + b * .114 > 150 ? '#202124' : '#ffffff' : undefined }} suppressContentEditableWarning
    onDoubleClick={event => { event.stopPropagation(); event.currentTarget.contentEditable = 'plaintext-only'; engine.pin(cardId, 'focus', true); event.currentTarget.focus(); }}
    onKeyDown={event => { if (event.currentTarget.isContentEditable) event.stopPropagation(); if (event.key === 'Escape') event.currentTarget.blur(); }}
    onCompositionStart={() => engine.pin(cardId, 'ime', true)} onCompositionEnd={() => engine.pin(cardId, 'ime', false)}
    onBlur={event => { engine.pin(cardId, 'focus', false); if (!event.currentTarget.isContentEditable) return; const text = event.currentTarget.textContent ?? ''; event.currentTarget.contentEditable = 'false'; if (text !== card.text) workspace.submit([{ op: 'update', id: cardId, set: { text } }]); }} />;
}
export function DrawingBody(props: CardBodyProps) {
  const card = useCard(props.workspace, props.cardId), pathElement = useRef<SVGPathElement>(null);
  useEffect(() => {
    if (card?.type !== 'shape') return;
    const drawing = DrawingProps.parse(card.props ?? {});
    if (drawing.points.length || drawing.shape === 'heart' || drawing.shape === 'line') return;
    const record = props.workspace.record(props.cardId); let width = 0, height = 0;
    const update = () => {
      const current = record.getSnapshot(); if (!current || current.w === width && current.h === height) return;
      width = current.w; height = current.h;
      // This is model geometry, not a layout read. Only resize commits change the SVG body path.
      pathElement.current?.setAttribute('d', pathD(shapePoints(drawing.shape), true, drawing.radius * 100 / Math.min(width, height)));
    };
    update(); return record.subscribe(update);
  }, [card?.type, card?.props, props.cardId, props.workspace]);
  if (!card) return null;
  if (card.type === 'stamp') { const stamp = StampProps.parse(card.props ?? {}); return <div className="draw-emoji" data-motion={stamp.mv || undefined} role="img" aria-label={stamp.emoji}>{stamp.emoji}</div>; }
  if (card.type === 'ink') {
    const ink = InkProps.parse(card.props ?? {}), first = ink.points[0], col = colour(ink.ink);
    const dot = !first || ink.points.length < 2 || ink.points.every(p => Math.hypot(p[0] - first[0], p[1] - first[1]) < .5);
    return <svg className="draw-art" viewBox={ink.ow && ink.oh ? `0 0 ${ink.ow} ${ink.oh}` : undefined} preserveAspectRatio="none" aria-label="Ink stroke">{dot ? <circle cx={first?.[0] ?? 0} cy={first?.[1] ?? 0} r={ink.size / 2} fill={col} opacity={ink.pen === 'hi' ? .38 : 1} /> : ink.pen === 'pen' ? <path d={butter(ink.points, true, ink.size)} fill={col} /> : <path d={centerline(ink.points)} fill="none" stroke={col} strokeWidth={ink.size} strokeLinecap="round" strokeLinejoin="round" opacity={ink.pen === 'hi' ? .38 : 1} />}</svg>;
  }
  const drawing = DrawingProps.parse(card.props ?? {}), line = card.type === 'shape' && drawing.shape === 'line';
  const path = !line && (card.type === 'path' || drawing.points.length > 0);
  const d = path ? pathD(drawing.points, card.type === 'shape' || drawing.closed, drawing.radius) : line ? drawing.squig === 'straight' ? 'M0 50 L100 50' : squigPath({ ...drawing, id: card.id }) : drawing.shape === 'heart' ? 'M50 92 C20 72 3 55 3 33 C3 15 17 4 31 4 C40 4 47 9 50 16 C53 9 60 4 69 4 C83 4 97 15 97 33 C97 55 80 72 50 92 Z' : pathD(shapePoints(drawing.shape), true, drawing.radius);
  const outline = outlineAttributes(drawing, card.type === 'shape' ? 2 : 2.5);
  return <><svg className="draw-art" viewBox={path ? drawing.ow && drawing.oh ? `0 0 ${drawing.ow} ${drawing.oh}` : undefined : '0 0 100 100'} preserveAspectRatio="none" onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); beginPointEdit(props.workspace, props.engine, props.cardId); }} style={line && drawing.lineHeight ? { height: drawing.lineHeight, position: 'absolute', top: '50%', transform: 'translateY(-50%)' } : undefined}><path ref={pathElement} d={d} {...outline} fill={line || (card.type === 'path' && !drawing.closed) ? 'none' : colour(drawing.fill, card.type === 'shape' ? '#aed3ff' : 'none')} strokeWidth={line ? drawing.lw ?? drawing.sw ?? 4 : outline.strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg>{!line && (card.type === 'shape' || card.text) && <ShapeText {...props} />}</>;
}
