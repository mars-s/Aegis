import { join } from 'node:path';
/** Test probes are compiled beside the app, sharing the same production module instances. */
export function browserTestEntries(root: string, implementation: 'legacy' | 'react'): Record<string, string> {
  const entries: Record<string, string> = { index: join(root, 'index.html') };
  if (process.env.AEGIS_TEST_FACADE !== '1') return entries;
  const modules = ['features/docs/editor.js', 'features/docs/export.js', 'features/deck/slides.js', 'features/editing/export.js', 'features/media/images.js', 'lib/ui/menu.js', 'lib/ui/dropdown.js', 'lib/native-files.ts'];
  const react = new Map([
    ['features/docs/editor.js', 'platform/document-test.ts'],
    ['features/docs/export.js', 'platform/document-export-test.ts'],
    ['features/editing/export.js', 'features/editing/board-export.tsx'],
    ['features/media/images.js', 'features/media/image-utils.ts'],
  ]);
  for (const module of modules) entries['src/' + module.replace(/\.ts$/, '.js')] = join(root, 'src', implementation === 'react' ? react.get(module) ?? module : module);
  return entries;
}
