// Shared by the host's lightweight board list and the Library preview.
export const plainLine = value => String(value ?? '').split('\n').find(line => line.trim())?.replace(/^\s*#{1,6}\s+/, '').replace(/[*_`]/g, '').trim().slice(0, 160) || '';
export const cardTitle = card => plainLine(card.props?.layerName || card.heading || card.text || card.props?.name);
const count = (n, singular, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;
const words = text => count(String(text || '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length, 'word');
const heading = text => plainLine(/^\s*#{1,6}\s+(.+)$/m.exec(text || '')?.[1] || text);
const names = { doc: 'Document', note: 'Note', todo: 'Checklist', deck: 'Deck', slides: 'Deck', dataset: 'Dataset', html: 'Custom UI', plot: 'Plot', sheet: 'Sheet' };

// Data only. Cache these when the board changes, never parse content during a zoom gesture.
export function cardSummary(card) {
  const type = card.type === 'object' ? card.kind : card.type;
  const kind = names[type] || `${type?.[0]?.toUpperCase() || ''}${type?.slice(1) || 'Window'}`;
  const data = card.data || {}, props = card.props || {};
  const title = cardTitle(card) || kind;
  let facts = [], preview;
  switch (type) {
    case 'doc': facts = [heading(props.body), plainLine(String(props.body || '').split('\n').filter(line => line.trim() && !/^\s*#/.test(line))[0]).split(/(?<=[.!?])\s/)[0]]; break;
    case 'sheet': case 'table': facts = [`${count(data.rows?.length || 0, 'row')} · ${count(data.columns?.length || 0, 'column')}`, plainLine(data.note)]; break;
    case 'dataset': facts = [`${count(props.rows || 0, 'row')} · ${count(props.columns?.length || 0, 'column')}`, plainLine(props.filename || props.source)]; break;
    case 'deck': case 'slides': facts = [count(props.slides?.length || 0, 'slide'), plainLine(props.slides?.[0]?.title)]; break;
    case 'plot': facts = [`${count(data.series?.length || 0, 'series', 'series')} · ${count(data.series?.reduce((n, s) => n + (s.points?.length || 0), 0) || 0, 'point')}`, plainLine(data.basis || data.y?.label)]; break;
    case 'html': facts = [plainLine(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(data.html || '')?.[1]?.replace(/<[^>]*>/g, '')), 'Interactive view']; break;
    case 'stats': facts = (data.tiles || []).slice(0, 2).map(tile => `${tile.label}: ${tile.value}`); break;
    case 'progress': facts = (data.goals || []).slice(0, 2).map(goal => `${goal.current}/${goal.target}${goal.unit ? ` ${goal.unit}` : ''} · ${goal.label}`); break;
    case 'diagram': facts = [`${count(data.nodes?.length || 0, 'step')} · ${count(data.edges?.length || 0, 'connection')}`]; break;
    case 'todo': case 'list': case 'plan': {
      const items = card.items || data.items || data.steps || [];
      facts = [`${items.filter(item => item.done).length}/${count(items.length, 'item')} complete`, plainLine(items[0]?.text || items[0]?.title)]; break;
    }
    case 'callout': case 'reply': facts = [plainLine(data.headline || data.text), plainLine(data.attribution)]; break;
    default: facts = [plainLine(card.heading ? card.text : String(card.text || '').split('\n').slice(1).join('\n')), words(card.text)];
  }
  if (type === 'plot') {
    const points = (data.series?.[0]?.points || []).filter(p => Number.isFinite(p.y));
    const last = points.at(-1);
    preview = { type: 'plot', values: points.map(p => p.y), value: data.headline?.value || (last ? `${last.y}${data.y?.unit ? ` ${data.y.unit}` : ''}` : ''), label: data.headline?.label || (last ? `${last.x} · ${data.y?.label || data.series?.[0]?.name || ''}` : '') };
  } else if (type === 'stats') preview = { type, tiles: (data.tiles || []).slice(0, 2) };
  else if (type === 'progress') preview = { type, goals: (data.goals || []).slice(0, 2) };
  else if (type === 'sheet' || type === 'table') preview = { type: 'sheet', columns: (data.columns || []).slice(0, 3).map(c => c.label), rows: (data.rows || []).slice(0, 2).map(row => row.cells?.slice(0, 3) || []) };
  else if (type === 'deck' || type === 'slides') preview = { type: 'deck', slide: props.slides?.[0] };
  else if (type === 'diagram') preview = { type, nodes: (data.nodes || []).slice(0, 4), edges: data.edges || [] };
  if (type === 'callout' || type === 'reply') facts = [plainLine(data.headline || data.text).split(/(?<=[.!?])\s/)[0]];
  const disclosure = ['callout', 'reply'].includes(type) ? plainLine(data.attribution) : '';
  return { title, kind, facts: facts.filter(Boolean).slice(0, 2), ...(preview ? { preview } : {}), ...(disclosure ? { disclosure } : {}) };
}
export function boardSubtitle(board) {
  const cards = board?.cards ?? [];
  const heading = cards.find(card => card.type === 'title' && cardTitle(card));
  if (heading) return cardTitle(heading);
  const document = cards.find(card => card.type === 'doc');
  if (document) return cardTitle(document) || plainLine(document.props?.body);
  return cardTitle(cards.find(card => cardTitle(card)) ?? {}) || 'An empty board, ready for an idea.';
}
