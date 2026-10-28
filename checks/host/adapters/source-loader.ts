import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { LoadHook, ResolveHook } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';

const app = new URL('../../../app/src/', import.meta.url).href;

export const resolve: ResolveHook = async (specifier, context, next) => {
  if (context.parentURL?.startsWith(new URL('./', import.meta.url).href) && ['react', 'react-dom/server', 'fflate'].includes(specifier)) {
    return next(specifier, { ...context, parentURL: new URL('main.tsx', app).href });
  }
  if (context.parentURL?.startsWith(app) && specifier.startsWith('.') && specifier.endsWith('.js')) {
    const target = new URL(specifier, context.parentURL);
    for (const extension of ['.ts', '.tsx']) {
      const source = new URL(target.href.slice(0, -3) + extension);
      if (existsSync(source)) return { url: source.href, shortCircuit: true };
    }
  }
  return next(specifier, context);
};

export const load: LoadHook = async (url, context, next) => {
  // Styles have no DOM in Node SSR. All executable imports use their real source.
  if (url.startsWith(app) && url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
  if (url.startsWith(app) && url.endsWith('.tsx')) {
    const result = await transformWithOxc(await readFile(new URL(url), 'utf8'), fileURLToPath(url), { lang: 'tsx', jsx: { runtime: 'automatic' } });
    return { format: 'module', source: result.code, shortCircuit: true };
  }
  return next(url, context);
};
