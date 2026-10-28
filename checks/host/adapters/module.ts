import { z } from 'zod/v4';

// Fixture-only boundary for helpers whose legacy owners have not ported their public API.
// Keep their original inputs and implementations, and validate every result used by a test.
export async function legacyModule(specifier: string) {
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
