import { CommandSchema } from '@aegis/domain';
import type { Command } from '@aegis/domain';
export function parseCapture(value: string): Command[] {
  const cards: Command[] = [];
  let todo: { text: string; done: boolean }[] | null = null;
  function flush() { if (todo) cards.push({ op: 'create', type: 'todo', text: 'Checklist', items: todo }); todo = null; }
  for (const line of value.split('\n').map(text => text.trim()).filter(Boolean)) {
    const item = /^-\s+(?:\[([ xX])\]\s*)?(.+)$/.exec(line);
    if (item && item[2]) { todo ??= []; todo.push({ text: item[2], done: !!item[1]?.trim() }); }
    else { flush(); cards.push(CommandSchema.parse(/^https?:\/\/\S+$/i.test(line) ? { op: 'create', type: 'link', text: '', url: line } : { op: 'create', type: 'note', text: line })); }
  }
  flush(); return cards;
}
