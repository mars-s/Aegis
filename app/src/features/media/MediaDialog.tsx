import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export function MediaDialog({ label, className, children, onClose }: { readonly label: string; readonly className?: string; readonly children: ReactNode; readonly onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement; element?.showModal();
    return () => { element?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} aria-label={label} className={`media-dialog ${className ?? ""}`} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}>{children}</dialog>;
}
