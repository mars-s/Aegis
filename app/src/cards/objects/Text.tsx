import { useObjectEditing } from './context.js';
import { Value } from './Value.js';
export function Text({ value = '', label, path, multiline = false, maxLength = 2000 }: {
  readonly value?: string; readonly label: string; readonly path: (string | number)[]; readonly multiline?: boolean; readonly maxLength?: number;
}) {
  const editing = useObjectEditing();
  if (!editing.enabled) return value;
  const hint = `Return to save · ${multiline ? 'Shift Return for a new line · ' : ''}Esc to cancel`;
  return <span className={`generated-text${multiline ? ' multiline' : ''}`}><Value value={value} label={label} multiline={multiline} maxLength={maxLength} display={value || 'Add text'} description={hint} onChange={next => editing.set(path, next)} /><span className="text-edit-hint">{hint}</span></span>;
}
