import type { CardId } from '@aegis/domain';
import { ValuePicker } from '../chrome/controls.js';
export function SourceStatus({ status, sources = [], onchoose }: { readonly status: string; readonly sources?: readonly { readonly id: CardId; readonly text: string }[]; readonly onchoose?: ((id: CardId) => void) | undefined }) {
  if (!status) return null;
  return <div className="chart-source-status"><p role="status">{status}</p>{onchoose ? <label>Choose source<ValuePicker label="Choose chart source" value="" options={[["", sources.length ? 'Select a source' : 'Add a source to this board'], ...sources.map(source => [source.id, source.text || 'Untitled source'] as const)]} onChange={value => { const source = sources.find(source => source.id === value); if (source) onchoose(source.id); }} /></label> : null}</div>;
}
