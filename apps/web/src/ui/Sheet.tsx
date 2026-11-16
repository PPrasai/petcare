import { useEffect, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  /** The accessible name of the dialog. */
  label: string;
  onClose: () => void;
  /** From 860 px: a right drawer (forms, the default), a centred dialog or the wide Log dialog. */
  variant?: 'drawer' | 'dialog' | 'wide';
  children: ReactNode;
}

/**
 * A modal sheet on the native <dialog>: a bottom sheet below 860 px, where `variant` has no effect.
 * From 860 px it is placed by `variant` (SPEC-petcare-004 5.6). The browser traps focus, closes on
 * Escape and gives focus back to the opener.
 */
export function Sheet({ open, label, onClose, variant = 'drawer', children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A click on the backdrop lands on the <dialog> itself, not on the sheet inside it.
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    // The backdrop click is a pointer convenience; Escape and the close button are the keyboard path.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-label={label}
      className="sheetdlg"
      data-variant={variant}
      onClose={onClose}
      onClick={onClick}
    >
      {open ? <div className="sheet">{children}</div> : null}
    </dialog>
  );
}
