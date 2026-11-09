import { useEffect } from 'react';
import { TOAST_MS, useToastStore } from '../shared/toast';

/** One toast at a time, announced politely and gone after a few seconds. */
export function ToastHost() {
  const message = useToastStore((s) => s.message);
  const serial = useToastStore((s) => s.serial);
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    if (message === null) return;
    const id = window.setTimeout(dismiss, TOAST_MS);
    return () => window.clearTimeout(id);
  }, [message, serial, dismiss]);

  return (
    <div role="status" aria-live="polite">
      {message ? <div className="toast">{message}</div> : null}
    </div>
  );
}
