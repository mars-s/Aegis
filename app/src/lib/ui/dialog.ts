import { cssMilliseconds } from './duration.js';
import { isKeyboard, reduceMotion } from './interaction.js';
let serial = 0, installed = false;
const controllers = new WeakMap<HTMLDialogElement, DialogController>();

interface DialogOptions {
  readonly label?: string | undefined;
  readonly initialFocus?: HTMLElement | (() => HTMLElement | null) | undefined;
  readonly dismissible?: boolean | undefined;
}
interface DialogController { readonly show: () => void; readonly close: () => void }
// Native dialogs provide the focus trap, inert background and top layer in WKWebView.
export function enhanceDialog(dialog: HTMLDialogElement, { label, initialFocus, dismissible = true }: DialogOptions = {}): DialogController {
  const existing = controllers.get(dialog);
  if (existing) return existing;
  dialog.classList.add('aegis-dialog');
  if (label) dialog.setAttribute('aria-label', label);
  let animation: Animation | undefined;
  function name() {
    if (dialog.hasAttribute('aria-label') || dialog.hasAttribute('aria-labelledby')) return;
    const heading = dialog.querySelector('h1, h2, h3');
    if (heading) { heading.id ||= `aegis-dialog-title-${++serial}`; dialog.setAttribute('aria-labelledby', heading.id); }
  }
  const nativeShow = dialog.showModal.bind(dialog);
  dialog.showModal = () => {
    if (dialog.open) return;
    name(); animation?.cancel();
    nativeShow();
    if (!isKeyboard() && !reduceMotion()) animation = dialog.animate([
      { opacity: 0, transform: 'translateY(4px) scale(.98)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], { duration: cssMilliseconds(getComputedStyle(dialog).getPropertyValue('--motion-dialog'), 180), easing: getComputedStyle(dialog).getPropertyValue('--ease-out').trim() });
    const target = typeof initialFocus === 'function' ? initialFocus() : initialFocus;
    target?.focus({ preventScroll: true });
  };
  const close = () => { animation?.cancel(); };
  const pointer = (event: PointerEvent) => {
    if (!dismissible || event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  };
  dialog.addEventListener('pointerdown', pointer);
  dialog.addEventListener('close', close);
  name();
  const api = { show: () => dialog.showModal(), close: () => dialog.close() };
  controllers.set(dialog, api); return api;
}

export function createDialog({ label, className = '', initialFocus, dismissible }: DialogOptions & { readonly className?: string } = {}) {
  const dialog = document.createElement('dialog'); dialog.className = className;
  enhanceDialog(dialog, { label, initialFocus, dismissible }); return dialog;
}

export function mountDialogs() {
  if (installed) return; installed = true;
  const scan = (root: Node) => {
    if (!(root instanceof Element)) return;
    if (root instanceof HTMLDialogElement) enhanceDialog(root);
    for (const dialog of root.querySelectorAll('dialog')) enhanceDialog(dialog);
  };
  scan(document.body);
  new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) scan(node); }).observe(document.body, { childList: true, subtree: true });
}
