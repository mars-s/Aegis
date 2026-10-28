import { join } from 'node:path';

/** Source modules that browser suites import directly. Test builds emit each under its own source path. */
export const BROWSER_TEST_MODULES = [
  'platform/document-test.ts',
  'platform/document-export-test.ts',
  'platform/deck-test.ts',
  'features/editing/board-export.tsx',
  'features/media/image-utils.ts',
  'lib/ui/menu.ts',
  'lib/ui/dropdown.ts',
  'lib/native-files.ts',
] as const;

/** Test probes are compiled beside the app, sharing the same production module instances. */
export function browserTestEntries(root: string): Record<string, string> {
  const entries: Record<string, string> = { index: join(root, 'index.html') };
  if (process.env.AEGIS_TEST_FACADE !== '1') return entries;
  for (const module of BROWSER_TEST_MODULES) entries['src/' + module] = join(root, 'src', module);
  return entries;
}
