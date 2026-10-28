import { build } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = dirname(fileURLToPath(import.meta.url));
export const browserOutput = join(source, 'dist');

export async function buildNativePages(): Promise<void> {
  await build({
    configFile: false, root: source, logLevel: 'warn',
    build: { outDir: browserOutput, emptyOutDir: true, target: 'safari16',
      rolldownOptions: { input: { 'fps.page': join(source, 'fps.page.ts'), 'react-replay.page': join(source, 'react-replay.page.ts') },
        output: { entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' } },
    },
  });
}
