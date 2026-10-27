import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ActionRegistration, FeatureContext } from '../composition.js';
import { shortcutTitle } from '../lib/shortcuts.js';

export function MobileTools({ actions, context, close, wireframe }: { readonly actions: readonly ActionRegistration[]; readonly context: FeatureContext; readonly close: () => void; readonly wireframe?: (close: () => void) => ReactNode }) {
  const [catalogue, setCatalogue] = useState(false);
  if (catalogue && wireframe) return wireframe(close);
  const group = (action: ActionRegistration): string => action.id === 'wireframe' ? 'Wireframe' : action.id === 'swatch' ? 'Colours' : 'Basics';
  return <>{['Basics', 'Wireframe', 'Colours'].map(name => <section key={name}><h3>{name}</h3><div className="tools-grid">{actions.filter(action => group(action) === name).map(action => <button key={action.id} type="button" onClick={() => {
    if (action.id === 'wireframe' && wireframe) setCatalogue(true);
    else { action.run(context); close(); }
  }}>{action.label}</button>)}{name === 'Basics' ? <button type="button" aria-label={shortcutTitle('quickCapture')} onClick={() => {
    close(); queueMicrotask(() => document.getElementById('quickCapture')?.click());
  }}>{shortcutTitle('quickCapture')}</button> : null}</div></section>)}</>;
}
