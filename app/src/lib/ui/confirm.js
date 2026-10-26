import './confirm.css';

// The app's own confirmation. Tauri's WKWebView has no JavaScript panel handler, so window.confirm() returns
// false without showing anything there. Resolves true only for the confirming button.
/** @param {{ title: string, body?: string, confirm?: string, cancel?: string, destructive?: boolean }} options */
export function confirmAction({ title, body = '', confirm = 'Delete', cancel = 'Cancel', destructive = true }) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = document.createElement('dialog');
  dialog.className = 'aegis-confirm';
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
    const finish = value => {
      if (done) return; done = true;
      dialog.close(); dialog.remove();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      resolve(value);
    };
    no.onclick = () => finish(false);
    yes.onclick = () => finish(true);
    dialog.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
    // A press on the backdrop dismisses, like other sheets in the app.
    dialog.addEventListener('pointerdown', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) finish(false); } });
    dialog.addEventListener('keydown', e => e.stopPropagation());
    dialog.showModal();
    // Keyboard users land on the safe choice; Return on it cancels.
    no.focus({ preventScroll: true });
  });
}
