import { JsonRecordSchema } from '@aegis/domain/schema';
import { z } from 'zod/v4';
import { DATASET_LIMITS } from '@aegis/domain/dataset';
import type { CardId } from '@aegis/domain';
import type { FeatureWorkspace } from '../../composition.js';
import { ProfileSchema } from '../../editors/dataset/protocol.js';
import type { DataServices } from './services.js';
const ResultSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('ok'), rows: z.number(), columns: z.array(z.string()), preview: z.array(z.array(z.string())), profile: ProfileSchema }), z.object({ kind: z.literal('error'), message: z.string() })]);
const AssetSchema = z.object({ url: z.string().regex(/^asset:[a-f0-9]{32}\.(csv|tsv)$/) });
export const isData = (file: Pick<File, 'name' | 'type'>) => /\.(csv|tsv)$/i.test(file.name) || ['text/csv', 'text/tab-separated-values', 'application/vnd.ms-excel'].includes(file.type);
export type ImportResult = { readonly kind: 'imported'; readonly id: CardId; readonly rows: number } | { readonly kind: 'error'; readonly message: string } | { readonly kind: 'cancelled' };
async function parseFile(file: File, signal: AbortSignal) {
  return new Promise<z.output<typeof ResultSchema>>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const worker = new Worker(new URL('./import-worker.ts', import.meta.url), { type: 'module' });
    const dispose = () => { worker.terminate(); signal.removeEventListener('abort', abort); };
    const abort = () => { dispose(); reject(new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = () => { dispose(); reject(new Error('The CSV reader stopped. Try importing again.')); };
    worker.onmessage = (event: MessageEvent<unknown>) => { dispose(); const parsed = ResultSchema.safeParse(event.data); if (parsed.success) resolve(parsed.data); else reject(new Error('The CSV reader returned invalid data.')); };
    worker.postMessage({ file });
  });
}
export async function importDataset({ workspace, services, file, at, signal }: { readonly workspace: FeatureWorkspace; readonly services: Pick<DataServices, 'upload'>; readonly file: File; readonly at: { readonly x: number; readonly y: number }; readonly signal: AbortSignal }): Promise<ImportResult> {
  if (signal.aborted) return { kind: 'cancelled' };
  if (file.size > DATASET_LIMITS.bytes) return { kind: 'error', message: `${file.name} is over ${DATASET_LIMITS.bytes / 1024 ** 2} MB.` };
  const boardId = workspace.metadata.getSnapshot().id;
  const lifetime = new AbortController();
  const abort = () => lifetime.abort();
  signal.addEventListener('abort', abort, { once: true });
  const unsubscribe = workspace.scene.subscribe(change => { if (change.kind === 'replace') abort(); });
  try {
    const parsed = await parseFile(file, lifetime.signal);
    if (parsed.kind === 'error') return parsed;
    if (lifetime.signal.aborted) return { kind: 'cancelled' };
    const saved = AssetSchema.parse(await services.upload(new File([file], file.name, { type: /\.tsv$/i.test(file.name) ? 'text/tab-separated-values' : 'text/csv' }), lifetime.signal));
    if (lifetime.signal.aborted || workspace.metadata.getSnapshot().id !== boardId) return { kind: 'cancelled' };
    const result = workspace.submit([{ op: 'create', type: 'dataset', text: file.name.replace(/\.(csv|tsv)$/i, ''), x: Math.round(at.x), y: Math.round(at.y), w: 640, h: 420, ref: 'dataset', props: JsonRecordSchema.parse(JSON.parse(JSON.stringify({ src: saved.url, name: file.name, rows: parsed.rows, columns: parsed.columns, preview: parsed.preview, profile: parsed.profile }))) }]);
    if (result.kind === 'rejected') return { kind: 'error', message: result.errors.map(error => error.reason).join('. ') };
    const id = result.created.dataset;
    if (!id) return { kind: 'error', message: 'The dataset could not be created.' };
    workspace.act({ kind: 'select', ids: [id] }); return { kind: 'imported', id, rows: parsed.rows };
  } catch (error) { return lifetime.signal.aborted ? { kind: 'cancelled' } : { kind: 'error', message: `Could not read ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}` }; }
  finally { unsubscribe(); signal.removeEventListener('abort', abort); }
}
