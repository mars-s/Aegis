import { createDialog } from './dialog.js';

export interface ConfirmOptions {
  readonly title: string;
  readonly body?: string;
  readonly confirm?: string;
  readonly cancel?: string;
  readonly destructive?: boolean;
}

// The app's own confirmation. Tauri's WKWebView has no JavaScript panel handler, so window.confirm() returns
// false without showing anything there. Resolves true only for the confirming button.
export function confirmAction({ title, body = '', confirm = 'Delete', cancel = 'Cancel', destructive = true }: ConfirmOptions): Promise<boolean> {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = createDialog({ className: 'aegis-confirm' });
  const heading = document.createElement('h2'), text = document.createElement('p'), actions = document.createElement('div');
  heading.id = `confirm-${Math.random().toString(36).slice(2)}`; heading.textContent = title;
  text.textContent = body; text.hidden = !body; actions.className = 'aegis-confirm-actions';
  const no = document.createElement('button'), yes = document.createElement('button');
  no.type = yes.type = 'button';
  no.className = 'aegis-button aegis-button--quiet'; no.textContent = cancel;
  yes.className = `aegis-button ${destructive ? 'aegis-button--danger' : 'aegis-button--primary'}`; yes.textContent = confirm;
  dialog.setAttribute('aria-labelledby', heading.id);
  actions.append(no, yes); dialog.append(heading, text, actions);
  // A dialog opened over another modal must sit inside it to stay interactive.
  const host = [...document.querySelectorAll('dialog[open]')].findLast(d => d.matches(':modal')) ?? document.body;
  host.append(dialog);
  return new Promise(resolve => {
    let done = false;
    const finish = (value: boolean): void => {
      if (done) return; done = true;
      dialog.close(); dialog.remove();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      resolve(value);
    };
    no.onclick = () => finish(false);
    yes.onclick = () => finish(true);
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    // A press on the backdrop dismisses, like other sheets in the app.
    dialog.addEventListener('pointerdown', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) finish(false); } });
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.showModal();
    // Keyboard users land on the safe choice; Return on it cancels.
    no.focus({ preventScroll: true });
  });
}
