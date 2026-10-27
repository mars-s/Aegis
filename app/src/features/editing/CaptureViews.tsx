import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceMetadata } from '../../workspace/index.js';
import type { FeatureContext } from '../../composition.js';
import { captureIdeas, describeCapture, parseCapture, putCaptured, undoCapture } from './capture.js';
import type { CaptureReceipt } from './capture.js';
import { shortcutTitle } from '../../lib/shortcuts.js';
import './capture.css';

// Quick capture behaviour ported from Aegis. See LICENSE.mochiboard.

function focusCanvas(): void {
  document.getElementById('stage')?.focus({ preventScroll: true });
}

export function CaptureButton() {
  return <button type="button" id="quickCapture" title={shortcutTitle("quickCapture")} aria-keyshortcuts="Meta+Shift+K Control+Shift+K">Idea</button>;
}

function CaptureDialog({ entry, capture, close, error }: {
  readonly entry: 'keyboard' | 'pointer';
  readonly capture: (text: string) => void;
  readonly close: () => void;
  readonly error: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const cards = parseCapture(text), empty = cards.length === 0;
  useLayoutEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    document.body.classList.add('capture-open');
    element?.showModal(); input.current?.focus({ preventScroll: true });
    return () => {
      document.body.classList.remove('capture-open'); element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    const field = input.current;
    if (field) {
      field.style.height = '0px';
      field.style.height = `${Math.min(innerHeight * .34, Math.max(122, field.scrollHeight))}px`;
    }
  }, [text]);
  function ask(): void {
    if (!text.trim() || document.getElementById('send')?.hasAttribute('disabled')) return;
    close();
    queueMicrotask(() => document.dispatchEvent(new CustomEvent('capture-to-agent', { detail: { text: text.trim() } })));
  }
  return <dialog ref={dialog} className="editing-capture" aria-label="Quick capture" data-entry={entry}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    }}>
    <form onSubmit={event => { event.preventDefault(); if (!empty) capture(text); }}>
      <header className="capture-head"><span className="orb-mark" aria-hidden="true"><span className="orb-colours" /><span className="orb-light" /></span><h2>Quick capture</h2><button type="button" className="capture-close" aria-label="Close quick capture" onClick={close}><kbd>Esc</kbd></button></header>
      <textarea ref={input} rows={3} aria-label="Capture idea" aria-describedby="capturePreview captureKeys" placeholder="What's on your mind?" autoComplete="off" maxLength={8000} value={text} onChange={event => setText(event.currentTarget.value)} onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); close(); }
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        if (event.metaKey || event.ctrlKey) { event.preventDefault(); ask(); }
        else if (!event.shiftKey) { event.preventDefault(); if (!empty) capture(text); }
      }} />
      <p className="capture-preview" id="capturePreview" role="status" aria-live="polite">{empty ? 'An idea, a link, or a list. Make room for it.' : `Ready to capture ${describeCapture(cards)}`}</p>
      {error ? <p className="capture-preview" role="alert">{error}</p> : null}
      <div className="capture-parsing"><span>URL <span>link card</span></span><span>- lines <span>checklist</span></span><span>Several lines <span>several notes</span></span></div>
      <footer><span className="capture-keys" id="captureKeys"><kbd>⇧↵</kbd> new line</span><div className="capture-actions"><button type="button" className="capture-agent" disabled={empty} onClick={ask}>Ask agent <kbd>⌘↵</kbd></button><button type="submit" className="capture-add" disabled={empty}>Capture <kbd>↵</kbd></button></div></footer>
    </form>
  </dialog>;
}

function CaptureConfirmation({ context, receipt, update, dismiss }: {
  readonly context: FeatureContext;
  readonly receipt: CaptureReceipt;
  readonly update: (receipt: CaptureReceipt) => void;
  readonly dismiss: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState('');
  function pause(): void { if (timer.current) clearTimeout(timer.current); }
  function expire(): void { pause(); timer.current = setTimeout(dismiss, 6000); }
  useEffect(() => { expire(); return pause; }, [receipt]);
  useEffect(() => {
    const engine = context.engine();
    if (receipt.location.kind === 'tray') {
      context.workspace.act({ kind: 'panel', side: 'left', open: true });
      document.querySelector('[data-panel="unsorted"]')?.dispatchEvent(new CustomEvent('panelreveal', { bubbles: true, detail: { capture: true } }));
      const rows = new Set<HTMLElement>();
      let revealed = false;
      const ids = new Set<string>(receipt.trayIds);
      const highlight = (): void => {
        for (const row of document.querySelectorAll<HTMLElement>('.tray-item')) {
          if (row.dataset.id && ids.has(row.dataset.id)) {
            if (!revealed && row.getClientRects().length) {
              row.scrollIntoView({ block: 'nearest', behavior: 'instant' }); revealed = true;
            }
            row.classList.add('capture-highlight'); rows.add(row);
          }
        }
      };
      const observer = new MutationObserver(highlight);
      observer.observe(document.getElementById('app') ?? document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); highlight();
      const clear = (): void => { observer.disconnect(); for (const row of rows) row.classList.remove('capture-highlight'); };
      const timeout = setTimeout(clear, 1200);
      return () => { clearTimeout(timeout); clear(); };
    }
    if (!engine) return;
    const ids = new Set(receipt.location.ids), shells = new Set<HTMLElement>();
    const release = engine.registerFrameParticipant({ write: () => {
      for (const lease of engine.leases.getSnapshot()) {
        const shell = lease.host.parentElement;
        if (shell && ids.has(lease.cardId)) { shell.classList.add('glow'); shells.add(shell); }
      }
    } });
    engine.navigate({ kind: 'fit', ids: receipt.location.ids, maximumZoom: 1, motion: 'instant' });
    const clear = (): void => { release(); for (const shell of shells) shell.classList.remove('glow'); };
    const timeout = setTimeout(clear, 1200);
    return () => { clearTimeout(timeout); clear(); };
  }, [context, receipt]);
  function put(): void {
    try {
      const engine = context.engine(); if (!engine) return;
      const area = engine.availableArea();
      const next = putCaptured(context.workspace, receipt, engine.screenToWorld({ x: area.x + area.width / 2, y: area.y + area.height / 2 }));
      if (next) update(next); else dismiss();
      focusCanvas();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not put these ideas on the board.'); }
  }
  return <div className="capture-confirmation" aria-label="Captured ideas" onPointerEnter={pause} onPointerLeave={expire} onFocus={pause} onBlur={expire}>
    <span role="status">{receipt.location.kind === 'tray' ? `Captured ${receipt.description} in Unsorted` : `On the board · ${receipt.description}`}</span>
    {receipt.location.kind === 'tray' ? <button type="button" data-put onClick={put}>Put on board</button> : null}
    <button type="button" data-undo onClick={() => {
      try { undoCapture(context.workspace, receipt); dismiss(); focusCanvas(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not undo this capture.'); }
    }}>Undo</button>
    {error ? <span role="alert">{error}</span> : null}
  </div>;
}

export function CaptureViews({ context }: { readonly context: FeatureContext }) {
  const board = useWorkspaceMetadata(context.workspace);
  const [entry, setEntry] = useState<'keyboard' | 'pointer' | null>(null);
  const [receipt, setReceipt] = useState<CaptureReceipt | null>(null), [error, setError] = useState('');
  useEffect(() => { setEntry(null); setReceipt(null); setError(''); }, [board.id]);
  useEffect(() => {
    function open(keyboard: boolean): void {
      if (document.querySelector('dialog[open]')) return;
      setReceipt(null); setError(''); setEntry(keyboard ? 'keyboard' : 'pointer');
    }
    const key = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k' && !event.defaultPrevented && !document.querySelector('dialog[open]')) {
        event.preventDefault(); event.stopImmediatePropagation(); open(true);
      }
    };
    const click = (event: MouseEvent): void => {
      if (event.target instanceof Element && event.target.closest('#quickCapture')) {
        event.preventDefault(); event.stopImmediatePropagation(); open(event.detail === 0);
      }
    };
    window.addEventListener('keydown', key, true); document.addEventListener('click', click, true);
    return () => { window.removeEventListener('keydown', key, true); document.removeEventListener('click', click, true); };
  }, []);
  return createPortal(<>
    {entry ? <CaptureDialog entry={entry} error={error} close={() => setEntry(null)} capture={text => {
      try {
        const saved = captureIdeas(context.workspace, text);
        if (!saved) return;
        setReceipt(saved); setEntry(null); setError(''); queueMicrotask(focusCanvas);
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not capture these ideas.'); }
    }} /> : null}
    {receipt && receipt.boardId === board.id ? <CaptureConfirmation context={context} receipt={receipt} update={setReceipt} dismiss={() => setReceipt(null)} /> : null}
    {error && !entry ? <p className="capture-confirmation" role="alert">{error}</p> : null}
  </>, document.body);
}
