// PM4 saving feedback: generated views share the board's host-confirmed queue state.
import { readable, writable } from 'svelte/store';
export const objectSaveState = writable('saved');
// Canvas confirmations recede together; editor confirmations keep the full state.
export const canvasSaveVisible = readable(true, set => {
  let timer;
  const unsubscribe = objectSaveState.subscribe(state => {
    clearTimeout(timer); set(true);
    if (state === 'saved') timer = setTimeout(() => set(false), 1500);
  });
  return () => { clearTimeout(timer); unsubscribe(); };
});
export const objectSaveLabel = state => state === 'saving' ? 'Saving…' : state === 'not saved' ? 'Not saved' : 'Saved';
export const retryObjectSave = () => document.getElementById('retrySave')?.click();

export function watchObjectSave(shell) {
  return objectSaveState.subscribe(state => {
    shell.setSaved(objectSaveLabel(state));
    if (state !== 'not saved') return;
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'text-btn'; retry.textContent = 'Retry';
    retry.setAttribute('aria-label', 'Retry save'); retry.onclick = retryObjectSave;
    shell.el.querySelector('[data-saved]').append(' ', retry);
  });
}
