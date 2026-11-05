import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A modal built on the native <dialog>: focus trap, Escape and backdrop come from the browser. */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onClose={onClose}
      className="m-auto w-[min(92vw,28rem)] rounded-xl border border-line bg-card p-5 text-ink"
    >
      <h2 id="dialog-title" className="mb-3 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
