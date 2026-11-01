import { useEffect, useState } from 'react';
import type { FeatureContext } from '../composition.js';
import { createImporter, ImportProgressView } from '../features/imports/react.js';
import type { ImportProgress } from '../features/imports/react.js';
import { useCreativeServices, useRecordingStore } from '../features/media/services.js';
export function CreativeImports({ context }: { readonly context: FeatureContext }) {
  const services = useCreativeServices(), recordings = useRecordingStore();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importer] = useState(() => createImporter(context, services, setProgress, recordings));
  useEffect(() => {
    const stage = document.getElementById('stage');
    if (!stage) throw new Error('Import routing requires the scene stage.');
    const dispose = importer.install(stage);
    return dispose;
  }, [importer]);
  return <ImportProgressView value={progress} />;
}
