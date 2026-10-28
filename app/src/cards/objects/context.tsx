import { createContext, useContext, useEffect, useRef } from "react";
import type { JsonValue } from "@aegis/domain";

export interface ObjectEditing {
  readonly enabled: boolean;
  readonly set: (path: (string | number)[], value: JsonValue) => boolean;
  readonly retain: (flush: () => boolean) => () => void;
  readonly pin: (token: symbol, pinned: boolean) => void;
}
export const ObjectEditingContext = createContext<ObjectEditing>({
  enabled: false,
  set: () => false,
  retain: () => () => {},
  pin: () => {},
});
export function useObjectEditing() {
  return useContext(ObjectEditingContext);
}
export function useDraftFlush(flush: () => boolean, dirty = false) {
  const { retain, pin } = useObjectEditing();
  const token = useRef(Symbol("object draft"));
  const current = useRef(flush);
  useEffect(() => {
    current.current = flush;
  });
  useEffect(() => retain(() => current.current()), [retain]);
  useEffect(() => {
    const key = token.current;
    pin(key, dirty);
    return () => pin(key, false);
  }, [pin, dirty]);
}
