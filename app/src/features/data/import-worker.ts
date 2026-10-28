import { z } from 'zod/v4';
import { parseCsv, profileDataset } from '@aegis/domain/dataset';
const InputSchema = z.object({ file: z.instanceof(File) });
self.onmessage = (event: MessageEvent<unknown>) => {
  const input = InputSchema.safeParse(event.data);
  if (!input.success) { self.postMessage({ kind: 'error', message: 'Invalid CSV file.' }); return; }
  void input.data.file.text().then(text => {
    const data = parseCsv(text);
    self.postMessage({ kind: 'ok', rows: data.rows.length, columns: data.columns, preview: data.rows.slice(0, 40).map(row => row.map(value => value.slice(0, 60))), profile: profileDataset(data) });
  }).catch(error => self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : 'Could not read the CSV.' }));
};
