import { t } from '../../i18n/t';
import { useConnectivityStore } from '../../state/connectivity';
import { Button, Line } from '../../ui';
import { useServices } from '../shared/services-context';
import { useNow } from '../shared/use-now';
import { relativeTime } from '../shared/when';

/** "Last synced · 2 min ago" with a Sync now button. Shown in Settings and on the sync page. */
export function LastSyncedLine() {
  const { sync } = useServices();
  const lastSyncedAt = useConnectivityStore((s) => s.lastSyncedAt);
  const pending = useConnectivityStore((s) => s.pendingCount);
  const syncing = useConnectivityStore((s) => s.syncing);
  const now = useNow();
  const when = lastSyncedAt ? relativeTime(lastSyncedAt, now) : '';
  const hint = !lastSyncedAt
    ? t('settings.data.neverSynced')
    : pending === 0
      ? t('settings.data.syncedHint', { when })
      : t('settings.data.pendingHint', { when, count: pending });
  return (
    <Line
      as="div"
      title={t('settings.data.lastSynced')}
      sub={hint}
      actions={
        <Button variant="secondary" disabled={syncing} onClick={() => void sync.syncNow()}>
          {t('sync.now')}
        </Button>
      }
    />
  );
}
