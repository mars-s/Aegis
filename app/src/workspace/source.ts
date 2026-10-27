import type { Source } from '@aegis/domain/schema';
export type { Source } from '@aegis/domain/schema';

export type Unsubscribe = () => void;

export interface WritableSource<T> extends Source<T> {
  readonly set: (value: T) => void;
  readonly clear: () => void;
}

export function createSource<T>(initial: T, notify: (listener: () => void) => void = listener => { listener(); }): WritableSource<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: changed => {
      listeners.add(changed);
      return () => { listeners.delete(changed); };
    },
    set: next => {
      if (Object.is(value, next)) return;
      value = next;
      for (const listener of [...listeners]) notify(listener);
    },
    clear: () => { listeners.clear(); },
  };
}
