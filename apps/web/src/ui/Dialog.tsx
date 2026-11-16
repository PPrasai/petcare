import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** From 860 px a dialog is 460 px wide; `mid` is 620 px (the image viewer). */
  size?: 'mid';
  children: ReactNode;
}

/** A modal built on the native <dialog>: focus trap, Escape and backdrop come from the browser. */
export function Dialog({ open, title, onClose, size, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="modal"
      data-size={size}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}
