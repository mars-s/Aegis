// Ported from Mochiboard (MIT, copyright 2026 Jessa Wolfe). See LICENSE.mochiboard.
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { CardBodyProps } from '../../composition.js';
import { useCard } from '../../workspace/index.js';
import { textOutlineStyle } from '../../features/wireframe/text-style.js';
import { WireProps } from './props.js';
import { useCreativeServices } from '../../features/media/services.js';
import { requestWireframeImage } from '../../features/wireframe/image.js';
import { takeCardEdit } from '../../features/media/creation-edit.js';
import '../../features/wireframe/wireframe.css';
import '../../features/wireframe/react.css';

export function WireframeBody({ cardId, workspace, engine }: CardBodyProps) {
  const card = useCard(workspace, cardId), text = useRef<HTMLDivElement>(null), services = useCreativeServices();
  useEffect(() => { if (text.current && document.activeElement !== text.current) text.current.textContent = card?.text || (card?.type === 'frame' ? 'Screen' : card?.type === 'section' ? 'Section' : card?.type === 'font' ? 'The quick brown fox jumps over the lazy dog.' : ''); }, [card?.text, card?.type]);
  useEffect(() => () => { engine.pin(cardId, 'focus', false); engine.pin(cardId, 'ime', false); }, [cardId, engine]);
  useEffect(() => {
    if (card?.type !== 'section') return;
    let scale = 0;
    return engine.registerFrameParticipant({ write: () => {
      const label = text.current, next = Math.max(1, Math.min(4, 1 / engine.camera().zoom));
      if (label && scale !== next) { label.style.transform = `scale(${next})`; scale = next; }
    } });
  }, [card?.type, engine]);
  useEffect(() => {
    const element = text.current;
    if (!element || !takeCardEdit(workspace, cardId)) return;
    element.focus({ preventScroll: true });
    getSelection()?.selectAllChildren(element);
  }, [workspace, cardId]);
  if (!card) return null;
  const p = WireProps.parse(card.props ?? {}), width = p.sdash === 'none' ? 0 : Math.max(0, Math.min(100, p.sw));
  const outline = textOutlineStyle(card);
  function editable(className: string, label: string, style?: CSSProperties) {
    return <div ref={text} className={className} role="textbox" aria-label={label} contentEditable="plaintext-only" suppressContentEditableWarning spellCheck={false} style={style} onFocus={() => engine.pin(cardId, 'focus', true)} onCompositionStart={() => engine.pin(cardId, 'ime', true)} onCompositionEnd={() => engine.pin(cardId, 'ime', false)} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') event.currentTarget.blur(); }} onBlur={event => { engine.pin(cardId, 'focus', false); const next = event.currentTarget.textContent ?? ''; if (next !== card?.text) workspace.submit([{ op: 'update', id: cardId, set: { text: next, ...(card?.type === 'text' ? { props: { contentFit: true, visualH: null } } : {}) } }]); }} />;
  }
  if (card.type === 'frame' || card.type === 'box') return <div className={`creative-wireframe ${card.type}`}>
    <div className="wf-visual" style={{ width: p.visualW, height: p.visualH, opacity: p.opacity, borderRadius: p.radius }}><svg className="wf-surface" width="100%" height="100%"><rect x={width / 2} y={width / 2} width={`calc(100% - ${width}px)`} height={`calc(100% - ${width}px)`} rx={p.radius} fill={p.fill || (card.type === 'frame' ? '#ffffff' : '#e4e4e7')} stroke={p.stroke || '#a1a1aa'} strokeWidth={width} strokeDasharray={p.sdash === 'dash' || p.sdash === true ? `${p.dl} ${p.dg}` : p.sdash === 'dot' ? `0 ${p.dg + width}` : undefined} strokeLinecap={p.sdash === 'dot' ? 'round' : undefined} vectorEffect="non-scaling-stroke" /></svg>
      {p.src ? <img src={services.assetUrl(p.src)} alt={p.img} draggable={false} /> : p.img ? <div className={`wf-placeholder${p.placeholder ? ' wf-placeholder-pattern' : ''}`} style={{ inset: width }}>{!p.placeholder && <span className="wf-mi">image</span>}<span>{p.img}</span>{p.placeholder ? <small>Placeholder, not AI-generated</small> : <button onClick={() => requestWireframeImage(workspace, cardId, services.notify)}>Fill image</button>}</div> : null}</div>
    {card.type === 'frame' && editable('wf-frame-name body', 'Screen name')}
  </div>;
  if (card.type === 'text') return <div className="creative-wireframe text">{editable('body wf-text', 'Wireframe text', { fontFamily: p.font, fontSize: p.size, fontWeight: p.weight, lineHeight: p.lh, textAlign: p.align, ...outline })}</div>;
  if (card.type === 'icon') return <div className="creative-wireframe icon"><span className="wf-mi wf-icon" style={{ fontSize: `min(${p.visualW === undefined ? '100cqw' : p.visualW + 'px'}, ${p.visualH === undefined ? '100cqh' : p.visualH + 'px'})`, ...outline }}>{p.name}</span></div>;
  if (card.type === 'font') return <div className="creative-wireframe font" style={{ fontFamily: p.font }}><div className="wf-aa">Aa</div><strong>{p.font}</strong><small>Browser / system font</small>{editable('body wf-specimen', 'Font specimen')}</div>;
  return <div className="creative-wireframe section" style={{ background: p.fill === 'none' ? 'transparent' : `color-mix(in srgb, ${p.fill || '#cbd5e1'} 8%, var(--card))`, borderRadius: p.radius }}>{editable('wf-section-name body', 'Section name')}</div>;
}
