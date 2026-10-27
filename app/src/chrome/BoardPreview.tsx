import { useEffect, useRef, useState } from 'react';
import type { Board, BoardId } from '@aegis/domain';
import { cardTitle } from '@aegis/domain/summary';
import { useSource } from '../workspace/index.js';
import type { LibraryService } from './library-model.js';

export function BoardPreview({ service, board }: { readonly service: LibraryService; readonly board: BoardId }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false), [snapshot, setSnapshot] = useState<Board | null>(null);
  const revision = useSource(service.source).boards.find(item => item.id === board)?.rev;
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [board]);
  useEffect(() => {
    if (!visible) return;
    const lifetime = new AbortController();
    void service.load(board, lifetime.signal).then(value => {
      if (!lifetime.signal.aborted) setSnapshot(value);
    }).catch(() => {});
    return () => lifetime.abort();
  }, [service, board, revision, visible]);
  return <div ref={host} className="board-preview-view">{snapshot ? <BoardGeometry board={snapshot} /> : null}</div>;
}

export function BoardGeometry({ board }: { readonly board: Board }) {
  const cards = board.cards.filter(card => !card.props?.hidden);
  if (!cards.length) return <svg viewBox="0 0 300 172" role="img" aria-label="Empty board"><text x="150" y="90" textAnchor="middle" fill="var(--muted)" fontSize="12">Empty board</text></svg>;
  const x = Math.min(...cards.map(card => card.x)), y = Math.min(...cards.map(card => card.y));
  const width = Math.max(100, ...cards.map(card => card.x + card.w - x)), height = Math.max(80, ...cards.map(card => card.y + card.h - y));
  const scale = Math.min(276 / width, 148 / height), ox = (300 - width * scale) / 2, oy = (172 - height * scale) / 2;
  return <svg viewBox="0 0 300 172" role="img" aria-label={`${board.name} preview: ${cards.length} windows`} preserveAspectRatio="xMidYMid meet">{cards.slice(0, 400).map(card => {
    const left = ox + (card.x - x) * scale, top = oy + (card.y - y) * scale, w = card.w * scale, h = card.h * scale;
    const title = cardTitle(card);
    const fill = card.color && !['plain', 'gray'].includes(card.color) ? `var(--c-${card.color}, var(--card))` : 'var(--preview-window, #252a30)';
    return <g key={card.id}><title>{title}</title><rect x={left} y={top} width={w} height={Math.max(3, h)} rx={2} fill={fill} stroke="var(--preview-line, #606a77)" strokeWidth=".65" />{w >= 65 ? <text x={left + 5} y={top + 11} fontSize="10" fontWeight="500" fill="var(--text)">{title.slice(0, Math.max(4, Math.floor((w - 10) / 5.6)))}</text> : null}</g>;
  })}</svg>;
}
