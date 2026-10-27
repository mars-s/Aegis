import { createContext, useContext, useEffect, useRef } from 'react';
import type { JsonValue } from '@aegis/domain';

export interface ObjectEditing {
  readonly enabled: boolean;
  readonly set: (path: (string | number)[], value: JsonValue) => boolean;
  readonly retain: (flush: () => boolean) => () => void;
}
export const ObjectEditingContext = createContext<ObjectEditing>({ enabled: false, set: () => false, retain: () => () => {} });
export function useObjectEditing() { return useContext(ObjectEditingContext); }
export function useDraftFlush(flush: () => boolean) {
  const { retain } = useObjectEditing();
  const current = useRef(flush);
  useEffect(() => { current.current = flush; });
  useEffect(() => retain(() => current.current()), [retain]);
}
