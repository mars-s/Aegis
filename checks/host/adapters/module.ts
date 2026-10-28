import { z } from 'zod/v4';

// Invoke real public domain functions with historic, intentionally partial fixtures.
// Each caller validates the result with the authoritative result schemas.
export async function productionModule(specifier: string) {
  const exports = z.record(z.string(), z.unknown()).parse(await import(specifier));
  return {
    value: (name: string): unknown => exports[name],
    call(name: string, ...args: unknown[]): unknown {
      const fn = exports[name];
      if (typeof fn !== 'function') throw new Error(`Missing fixture export ${name} in ${specifier}`);
      return fn(...args);
    },
  };
}

export const point = z.object({ x: z.number(), y: z.number() });
