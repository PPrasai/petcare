import { t } from '../../i18n/t';
import { useConnectivityStore } from '../../state/connectivity';

/** Offline indicator and pending count. Rendered in the shell, so it is on every route. */
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
    <section
      aria-label={t('sync.indicatorLabel')}
      className="flex flex-wrap items-center gap-x-3 text-sm"
    >
      <span
        data-testid="connectivity"
        className={`rounded-full border px-2 py-0.5 font-medium ${online ? 'border-line' : 'border-warn bg-warn-bg text-warn'}`}
      >
        {state}
      </span>
      <span data-testid="pending-count" data-count={pending}>
        {detail}
      </span>
      {error && online ? (
        <span className="text-danger">{t('sync.error', { code: error })}</span>
      ) : null}
    </section>
  );
}
