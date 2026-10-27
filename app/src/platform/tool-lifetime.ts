import type { CanvasEngine } from '@aegis/scene';

type ToolHost = Pick<CanvasEngine, 'afterInput' | 'tool' | 'toolName'>;
const owners = new WeakMap<ToolHost, symbol>();

/** An old tool's deferred cleanup must never disarm its replacement. */
export function toolExit(host: ToolHost, name: string, finished?: () => void): () => void {
  const owner = Symbol(name);
  owners.set(host, owner);
  return () => host.afterInput(() => {
    if (owners.get(host) !== owner || host.toolName() !== name) return;
    owners.delete(host);
    host.tool(null);
    finished?.();
  });
}
