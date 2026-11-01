import { WELCOME_BRIEF } from '@aegis/domain/profile';
import { Fragment, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { AgentSnapshot } from './schema.js';

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let start = 0;
  for (const match of text.matchAll(/(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g)) {
    if (match.index > start) nodes.push(text.slice(start, match.index));
    const token = match[0];
    const key = match.index;
    if (token.startsWith('`')) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('**') || token.startsWith('__')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    start = match.index + token.length;
  }
  if (start < text.length) nodes.push(text.slice(start));
  return nodes;
}

export function ChatText({ text }: { readonly text: string }) {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; lines: string[] } | null = null;
  function flushParagraph(): void {
    if (paragraph.length) blocks.push(<p key={blocks.length}>{paragraph.map((line, i) => <Fragment key={i}>{i > 0 ? <br /> : null}{inline(line)}</Fragment>)}</p>);
    paragraph = [];
  }
  function flushList(): void {
    if (!list) return;
    const items = list.lines.map((line, i) => <li key={i}>{inline(line)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  }
  for (const line of text.split('\n')) {
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flushParagraph();
      const ordered = /^\s*\d/.test(line);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, lines: [] };
      list.lines.push(item[1] ?? '');
    } else {
      flushList();
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (!line.trim()) flushParagraph();
      else if (heading) { flushParagraph(); blocks.push(<p key={blocks.length} className="chat-heading">{inline(heading[1] ?? '')}</p>); }
      else paragraph.push(line);
    }
  }
  flushParagraph(); flushList();
  return <>{blocks}</>;
}

export function Conversation({ agent, className }: { readonly agent: AgentSnapshot | null; readonly className: string }) {
  const element = useRef<HTMLDivElement>(null);
  const scroll = useRef({ top: 0, follows: true });
  useLayoutEffect(() => {
    const node = element.current;
    if (node) node.scrollTop = scroll.current.follows ? node.scrollHeight : scroll.current.top;
  }, [agent]);
  const turns = agent ? [...agent.turns] : [];
  if (agent && !turns.length && agent.brief) turns.push({ id: 'request', role: 'user', text: agent.brief });
  if (agent && !agent.turns.length && agent.text) turns.push({ id: 'answer', role: 'assistant', text: agent.text });
  if (agent?.partial) turns.push({ id: 'streaming', role: 'assistant', text: agent.partial });
  // Only the first request belonging to the local introduction is synthetic. Keep real replies intact.
  const introduction = agent?.id === localStorage.getItem('aegis:introduction-agent') || agent?.brief === WELCOME_BRIEF;
  const visibleTurns = introduction && turns[0]?.role === 'user' && ['Introduction', WELCOME_BRIEF].includes(turns[0].text) ? turns.slice(1) : turns;
  return <div ref={element} className={className} role="log" aria-label="Agent conversation" tabIndex={0} hidden={!agent}
    onScroll={event => { const node = event.currentTarget; scroll.current = { top: node.scrollTop, follows: node.scrollHeight - node.scrollTop - node.clientHeight < 36 }; }}>
    {visibleTurns.map(turn => <div key={turn.id} className={`island-turn ${turn.role}${turn.id === 'streaming' ? ' streaming' : ''}`}>
      <span className="turn-author">{turn.role === 'user' ? 'You' : 'Agent'}</span>
      <div className="turn-text">{turn.role === 'user' ? turn.text : <ChatText text={turn.text} />}</div>
    </div>)}
  </div>;
}
