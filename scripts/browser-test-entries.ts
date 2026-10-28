import { join } from 'node:path';
/** Test probes share the same compiled production implementations as the app. */
export function browserTestEntries(root: string): Record<string, string> {
  const entries: Record<string, string> = { index: join(root, 'index.html') };
  if (process.env.AEGIS_TEST_FACADE !== '1') return entries;
  const modules = {
    'features/docs/editor.js': 'platform/document-test.ts',
    'features/docs/export.js': 'platform/document-export-test.ts',
    'features/deck/slides.js': 'platform/deck-test.tsx',
    'features/editing/export.js': 'features/editing/board-export.tsx',
    'features/media/images.js': 'features/media/image-utils.ts',
    'lib/ui/menu.js': 'lib/ui/menu.ts',
    'lib/ui/dropdown.js': 'lib/ui/dropdown.ts',
    'lib/native-files.js': 'lib/native-files.ts',
  };
  for (const [publicPath, implementation] of Object.entries(modules)) entries['src/' + publicPath] = join(root, 'src', implementation);
  return entries;
}
