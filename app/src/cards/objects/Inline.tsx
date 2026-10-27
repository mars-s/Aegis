// Inline markup adapted from Zephium at 0eaad6d, MPL-2.0.
import { Fragment } from 'react';
export function Inline({ text, plain = false }: { readonly text: string; readonly plain?: boolean }) {
  const parts = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`)/gu;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) parts.push(<Fragment key={at}>{text.slice(at, match.index)}</Fragment>);
    parts.push(match[2] !== undefined ? <strong className={plain ? 'plain' : undefined} key={match.index}>{match[2]}</strong> : <code key={match.index}>{match[3] ?? ''}</code>);
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push(<Fragment key={at}>{text.slice(at)}</Fragment>);
  return <span className="object-inline">{parts}</span>;
}
