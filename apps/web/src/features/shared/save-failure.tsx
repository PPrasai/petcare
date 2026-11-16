import { useState } from 'react';
import type { ReactNode } from 'react';
import { FileStorageUnavailable } from '../../application/ports/file-gateway';
import { t } from '../../i18n/t';

/**
 * The inline message a form shows when saving fails for a reason the user cannot fix by editing a
 * field (storage trouble, a bug): "Couldn't save. Try again." Forms call `fail` from the catch
 * block that handles field problems, `clear` when they start saving, and render `view`.
 */
export function useSaveFailure(): {
  fail: (error: unknown) => void;
  clear: () => void;
  view: ReactNode;
} {
  const [failure, setFailure] = useState<'save' | 'files' | null>(null);
  return {
    fail: (error) => setFailure(error instanceof FileStorageUnavailable ? 'files' : 'save'),
    clear: () => setFailure(null),
    view: failure ? (
      <p className="err" role="alert">
        {t(failure === 'files' ? 'files.storageUnavailable' : 'form.saveFailed')}
      </p>
    ) : null,
  };
}
