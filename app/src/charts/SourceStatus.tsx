import type { CardId } from '@aegis/domain';
export function SourceStatus({ status, sources = [], onchoose }: { readonly status: string; readonly sources?: readonly { readonly id: CardId; readonly text: string }[]; readonly onchoose?: ((id: CardId) => void) | undefined }) {
  if (!status) return null;
  return <div className="chart-source-status"><p role="status">{status}</p>{onchoose ? <label>Choose source<select aria-label="Choose chart source" value="" onChange={event => { const source = sources.find(source => source.id === event.currentTarget.value); if (source) onchoose(source.id); }}><option value="" disabled>{sources.length ? 'Select a source' : 'Add a source to this board'}</option>{sources.map(source => <option key={source.id} value={source.id}>{source.text || 'Untitled source'}</option>)}</select></label> : null}</div>;
}
