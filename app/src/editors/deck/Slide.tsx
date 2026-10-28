import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CardId } from '@aegis/domain/schema';
import type { FeatureWorkspace } from '../../composition.js';
import { DeckChart } from '../../charts/index.js';
import { SLIDE_WIDTH, SLIDE_HEIGHT, slideImages, slideLayout } from './model.js';
import type { DeckServices, IdentifiedSlide } from './model.js';
import type { DeckSession } from './session.js';
import { sharedDeckChart } from './chart.js';
import { ValueChart } from './ValueChart.js';
import './slides.css';

const ridges = (() => {
  let seed = 7;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 9 }, (_, k) => {
    const base = 40 + k * 9, amp = 30 - k * 2.2, phase = random() * 6, phase2 = random() * 6;
    let path = '';
    for (let x = 0; x <= 400; x += 8) {
      const y = base - amp * Math.exp(-((x - 250) ** 2) / 9000) - 10 * Math.sin(x / 47 + phase) * Math.sin(x / 23 + phase2) * (1 - k / 12);
      path += `${x ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
    }
    return path;
  });
})();
function TextField({ value, name, field, idea, session, slideId }: {
  readonly value: string; readonly name: string; readonly field: 'title' | 'sub' | 'body';
  readonly idea?: number; readonly session?: DeckSession | undefined; readonly slideId: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null), initial = useRef(value);
  useEffect(() => { if (ref.current && ref.current.textContent !== value) ref.current.textContent = value; }, [value]);
  const input = (element: HTMLParagraphElement) => {
    if (!session) return;
    const text = element.innerText.replace(/\r\n/g, '\n');
    if (idea !== undefined) {
      const slide = session.getSnapshot().slides.find(slide => slide.id === slideId);
      const ideas = (slide?.body ?? '').split('\n'); ideas[idea] = text.replace(/\n/g, ' ');
      session.patch(slideId, { body: ideas.join('\n') });
    } else session.patch(slideId, { [field]: text });
  };
  return <p ref={ref} className={idea === undefined ? `s-${field}` : 'deck-idea'} data-k={field} data-idea={idea}
    contentEditable={session ? 'plaintext-only' : undefined} suppressContentEditableWarning spellCheck={!!session}
    role={session ? 'textbox' : undefined} aria-label={session ? name : undefined} aria-multiline={session ? field === 'body' && idea === undefined : undefined}
    data-placeholder={name.replace(/^Slide \d+ /, '')} onInput={event => input(event.currentTarget)}
    onCompositionStart={() => session?.compose(true)} onCompositionEnd={event => { input(event.currentTarget); session?.compose(false); }}>{initial.current}</p>;
}
export interface SlideProps {
  readonly slide: IdentifiedSlide;
  readonly workspace: FeatureWorkspace;
  readonly services: DeckServices;
  readonly deckId: CardId;
  readonly number?: number;
  readonly miniature?: boolean;
  readonly session?: DeckSession;
}
export const SlideView = memo(function SlideView({ slide, workspace, services, deckId, number = 1, miniature = false, session }: SlideProps) {
  const fit = useRef<HTMLDivElement>(null), art = useRef<HTMLDivElement>(null), frame = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!miniature);
  useEffect(() => {
    const host = fit.current; if (!host || !miniature) return;
    const observer = new IntersectionObserver(entries => { setVisible(entries.some(entry => entry.isIntersecting)); });
    observer.observe(host); return () => observer.disconnect();
  }, [miniature]);
  const [box, setBox] = useState({ width: 0, height: 0, scale: 0, left: 0, top: 0 });
  const layout = slideLayout(slide), wave = layout === 'title' && (slide.background === 'sci-fi-wave' || slide.background == null);
  const images = slideImages(slide);
  const chart = slide.chart ?? {}, resolvedChart = !!(chart.sourceId || chart.spec);
  const overlap = slide.relationship === 'overlap', ideas = (slide.body ?? '').split('\n');
  useEffect(() => {
    const host = fit.current, body = frame.current, drawing = art.current;
    if (!host || !body) return;
    const observer = new ResizeObserver(() => {
      const width = host.clientWidth, height = host.clientHeight;
      const scale = Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT);
      host.style.setProperty('--slide-scale', String(scale));
      // Layout changes only. Camera pan/zoom never publishes a React snapshot.
      const next = { width: (drawing?.clientWidth ?? 0) * scale, height: (drawing?.clientHeight ?? 0) * scale,
        scale, left: (width - SLIDE_WIDTH * scale) / 2 + (drawing?.offsetLeft ?? 0) * scale,
        top: (height - SLIDE_HEIGHT * scale) / 2 + (drawing?.offsetTop ?? 0) * scale };
      setBox(previous => previous.width === next.width && previous.height === next.height && previous.scale === next.scale && previous.left === next.left && previous.top === next.top ? previous : next);
    });
    observer.observe(host); observer.observe(body); if (drawing) observer.observe(drawing);
    return () => observer.disconnect();
  }, [layout, slide.title, slide.sub, overlap]);
  const text = (field: 'title' | 'sub' | 'body', label: string) => <TextField field={field} value={slide[field] ?? ''} name={`Slide ${number} ${label}`} session={session} slideId={slide.id} />;
  const style: CSSProperties = { width: SLIDE_WIDTH, height: SLIDE_HEIGHT };
  const chartStyle: CSSProperties = { left: box.left, top: box.top, width: box.width, height: box.height };
  return <div className="deck-fit" ref={fit}>
    <div ref={frame} className={`deck-slide l-${layout}${layout === 'title' && !wave ? ' bg-plain' : ''}${layout === 'three' && overlap ? ' has-overlap' : ''}${slide.imageOnly === true ? ' image-only' : ''}`} style={style} data-slide={slide.id}>
      <div className="s-copy">{text('title', 'title')}{text('sub', 'subtitle')}{layout === 'text' || layout === 'image' ? text('body', 'body') : null}</div>
      {layout === 'chart' || layout === 'three' || layout === 'image' || wave ? <div className="s-art" ref={art} style={layout === 'image' ? { gridTemplateRows: `repeat(${Math.max(1, images.length)}, minmax(0, 1fr))` } : undefined}>
        {layout === 'chart' && !resolvedChart ? <ValueChart chart={chart} width={box.width} height={box.height} presentationHeight={box.scale * SLIDE_HEIGHT} /> : null}
        {wave ? <svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">{ridges.map((path, index) => <path key={index} className={`deck-ridge${index === 2 ? ' hi' : ''}`} d={path} />)}</svg> : null}
        {layout === 'three' ? overlap ? <svg viewBox="0 0 200 180" role="img" aria-label="Overlapping ideas" className="deck-three" fontFamily="Inter Variable, sans-serif" fontSize="10" fontWeight="400" textRendering="geometricPrecision">
          <circle cx="78" cy="72" r="52" /><circle cx="122" cy="72" r="52" /><circle className="hi" cx="100" cy="110" r="52" />
          <text x="52" y="58">{ideas[0]}</text><text x="148" y="58">{ideas[1]}</text><text x="100" y="150">{ideas[2]}</text>
        </svg> : <div className="deck-ideas">{[0, 1, 2].map(index => <TextField key={index} field="body" idea={index} value={ideas[index] ?? ''} name={`Slide ${number} idea ${index + 1}`} session={session} slideId={slide.id} />)}</div> : null}
        {layout === 'image' ? images.map((image, index) => <div key={`${image.src}:${index}`} className="deck-picture-slot"><img className="s-picture" src={services.assetUrl(image.src)} alt={image.alt || slide.title || 'Slide image'} loading="lazy" decoding="async" draggable={false} /></div>) : null}
      </div> : null}
    </div>
    {layout === 'chart' && resolvedChart && visible && box.width > 0 && box.height > 0 ? <div className="deck-resolved-chart deck-chart-host" style={chartStyle}><DeckChart workspace={workspace} deckId={deckId} slideId={slide.id} chart={sharedDeckChart(chart)} title={slide.title ?? 'Chart'} miniature={miniature}
      presentationHeight={box.scale * SLIDE_HEIGHT} viewScale={1} onchoose={session ? id => session.patch(slide.id, { chart: { sourceId: id } }) : undefined} /></div> : null}
  </div>;
});
