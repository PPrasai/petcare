import { Link } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import { useConnectivityStore } from '../../state/connectivity';

/**
 * The sync pill in the header: connection state and how many changes are waiting. It is the way to
 * the sync activity page, and it is on every signed-in route (QA-16).
 */
export function SyncIndicator() {
  const online = useConnectivityStore((s) => s.online);
  const pending = useConnectivityStore((s) => s.pendingCount);
  const syncing = useConnectivityStore((s) => s.syncing);
  const error = useConnectivityStore((s) => s.error);

  const state = online ? (syncing ? t('sync.syncing') : t('sync.online')) : t('sync.offline');
  const detail =
    pending === 0
      ? t('sync.upToDate')
      : pending === 1
        ? t('sync.pendingOne')
        : t('sync.pending', { count: pending });

  return (
    <Link to="/sync" className={`sync ${online ? '' : 'off'}`} title={t('nav.sync')}>
      <span data-testid="connectivity">{state}</span>
      <span className="sep" aria-hidden="true">
        ·
      </span>
      <span data-testid="pending-count" data-count={pending}>
        {detail}
      </span>
      {error && online ? <span>{t('sync.error', { code: error })}</span> : null}
    </Link>
  );
}
