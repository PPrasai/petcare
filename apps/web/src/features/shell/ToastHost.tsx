import { useEffect, useState } from 'react';
import { t } from '../../i18n/t';
import { TOAST_MS, useToastStore } from '../shared/toast';

/** One toast. While the pointer or keyboard focus is on it the timer waits (WCAG 2.2.1). */
function Toast({ message, undo }: { message: string; undo: (() => void) | null }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const paused = hover || focus;

  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(dismiss, TOAST_MS);
    return () => window.clearTimeout(id);
  }, [paused, dismiss]);

  return (
    <div
      className="toast"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    >
      <span>{message}</span>
      {undo ? (
        <button
          type="button"
          onClick={() => {
            undo();
            dismiss();
          }}
        >
          {t('toast.undo')}
        </button>
      ) : null}
    </div>
  );
}

/** One toast at a time, announced politely and gone after a few seconds. */
export function ToastHost() {
  const message = useToastStore((s) => s.message);
  const undo = useToastStore((s) => s.undo);
  const serial = useToastStore((s) => s.serial);
  return (
    <div role="status" aria-live="polite">
      {/* Keyed by serial: each toast, even the same text again, gets a fresh timer. */}
      {message ? <Toast key={serial} message={message} undo={undo} /> : null}
    </div>
  );
}
