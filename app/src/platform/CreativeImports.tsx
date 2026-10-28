import { useEffect, useState } from 'react';
import type { FeatureContext } from '../composition.js';
import { createImporter, ImportProgressView } from '../features/imports/react.js';
import type { ImportProgress } from '../features/imports/react.js';
import { useCreativeServices, useRecordingStore } from '../features/media/services.js';
export function CreativeImports({ context, attached }: { readonly context: FeatureContext; readonly attached: (choose: (() => void) | null) => void }) {
  const services = useCreativeServices(), recordings = useRecordingStore();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importer] = useState(() => createImporter(context, services, setProgress, recordings));
  useEffect(() => {
    const stage = document.getElementById('stage');
    if (!stage) throw new Error('Import routing requires the scene stage.');
    attached(importer.choose); const dispose = importer.install(stage);
    return () => { attached(null); dispose(); };
  }, [attached, importer]);
  return <ImportProgressView value={progress} />;
}
