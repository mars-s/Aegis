import { failureMessage } from '@aegis/host-client';
import type { HostClient } from '@aegis/host-client';
import { importDataset, isData } from '../cards/data/index.js';
import type { FeatureContext } from '../composition.js';

export function installDataImport(args: {
  readonly context: FeatureContext;
  readonly client: HostClient;
  readonly error: (message: string) => void;
}): () => void {
  const lifetime = new AbortController();
  const stageEvent = (event: DragEvent): boolean => event.target instanceof Element && event.target.closest('#stage') !== null;
  const drag = (event: DragEvent): void => {
    if (stageEvent(event) && event.dataTransfer?.types.includes('Files')) event.preventDefault();
  };
  const drop = (event: DragEvent): void => {
    if (!stageEvent(event)) return;
    const files = Array.from(event.dataTransfer?.files ?? []).filter(isData);
    const engine = args.context.engine();
    const stage = document.getElementById('stage');
    if (!files.length || !engine || !stage) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const at = engine.screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    const services = {
      upload: async (file: File, signal: AbortSignal) => {
        const uploaded = await args.client.upload(file, signal);
        if (uploaded.kind === 'ok') return uploaded.value;
        if (uploaded.error.kind === 'cancelled') throw new DOMException('Cancelled', 'AbortError');
        throw new Error(failureMessage(uploaded.error));
      },
    };
    for (const file of files) {
      void importDataset({ workspace: args.context.workspace, services, file, at, signal: lifetime.signal }).then(result => {
        if (result.kind === 'error' && !lifetime.signal.aborted) args.error(result.message);
      });
    }
  };
  window.addEventListener('dragover', drag);
  window.addEventListener('drop', drop);
  return () => {
    lifetime.abort();
    window.removeEventListener('dragover', drag);
    window.removeEventListener('drop', drop);
  };
}
