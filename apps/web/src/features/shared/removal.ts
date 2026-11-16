import { t } from '../../i18n/t';
import type { StoredRecord } from '../../application/ports/record-store';
import { useServices } from './services-context';
import { useToastStore } from './toast';

/**
 * Deletes a record with no confirm dialog: a toast says what went and offers Undo, which brings
 * the record back. A failed delete or undo says so instead of failing silently.
 */
export function useRemoval(): (record: StoredRecord, name: string) => Promise<boolean> {
  const { removal } = useServices();
  const show = useToastStore((s) => s.show);
  return async (record, name) => {
    try {
      await removal.remove(record);
    } catch {
      show(t('form.deleteFailed', { name }));
      return false;
    }
    show(t('form.deleted', { name }), {
      undo: () => {
        removal.restore(record).catch(() => show(t('form.undoFailed', { name })));
      },
    });
    return true;
  };
}
