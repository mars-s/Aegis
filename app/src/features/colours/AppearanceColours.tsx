import { useState } from 'react';
import type { Board } from '@aegis/domain';
import { ColourPicker } from './ColourEditor.js';
import { normHex } from './model.js';
import { readAppearanceSettings } from './appearance.js';
import type { AppearanceSettings } from './appearance.js';
export { contrastText } from './appearance.js';
export function AppearanceColours({ mode, board, invalidate }: { readonly mode: 'light' | 'dark'; readonly board: () => Board; readonly invalidate: () => void }) {
  const [data, setData] = useState<AppearanceSettings>(readAppearanceSettings);
  function save(next: AppearanceSettings) { localStorage.setItem('aegis:colour-settings', JSON.stringify(next)); setData(next); window.dispatchEvent(new Event('aegis-colour-settings')); invalidate(); }
  return <section className="sheet-sec colour-settings" data-colour-settings=""><h3>Board colours</h3><p className="muted">App colours are saved separately for light and dark mode. A board background takes priority.</p><small className="muted">Editing {mode} mode</small>{([{ key: 'bg', label: 'App board background' }, { key: 'dot', label: 'Grid dots' }, { key: 'panel', label: 'Panels' }, { key: 'accent', label: 'Accent' }] as const).map(({ key, label }) => <div key={key} className="settings-colour"><span className="settings-colour-name">{label}</span><ColourPicker label={label} value={normHex(data[mode][key]) || (key === 'panel' ? mode === 'dark' ? '#141618' : '#ffffff' : key === 'accent' ? mode === 'dark' ? '#ffffff' : '#111113' : key === 'dot' ? mode === 'dark' ? '#80899d' : '#3c4250' : mode === 'dark' ? '#000000' : '#f5f5f7')} board={board} onChange={hex => save({ ...data, [mode]: { ...data[mode], [key]: hex } })} /></div>)}<button onClick={() => save({ ...data, [mode]: {} })}>Reset colours for this mode</button></section>;
}
