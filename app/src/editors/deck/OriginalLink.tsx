import { useEffect, useRef, useState } from 'react';
import type { DeckServices } from './model.js';
import { originalFile } from './model.js';

export function OriginalLink({ original, services, compact = false }: {
  readonly original: NonNullable<ReturnType<typeof originalFile>>;
  readonly services: DeckServices;
  readonly compact?: boolean;
}) {
  const request = useRef<AbortController | null>(null), [error, setError] = useState('');
  useEffect(() => () => { request.current?.abort(); }, []);
  return <><a className="deck-source" href={services.assetUrl(original.original)} download={original.name || 'Presentation'} aria-label="Download original presentation" onClick={event => {
    event.preventDefault(); request.current?.abort(); const lifetime = new AbortController(); request.current = lifetime; setError('');
    void (async () => {
      try {
        const response = await fetch(services.assetUrl(original.original), { signal: lifetime.signal });
        if (!response.ok) throw new Error('The original file is no longer available.');
        const blob = await response.blob(); if (lifetime.signal.aborted) return;
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.download = original.name || 'Presentation'; link.href = url; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (cause) { if (!lifetime.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not download the original file.'); }
    })();
  }}>{compact ? 'Original' : 'Original file'}</a>{error ? <span className="deck-download-error" role="alert">{error}</span> : null}</>;
}
