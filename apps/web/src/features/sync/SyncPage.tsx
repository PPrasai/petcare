import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConflictItem } from '../../application/ports/remote-api';
import { t } from '../../i18n/t';
import { formatDate } from '../../lib/format';
import { useConnectivityStore } from '../../state/connectivity';
import { useSessionStore } from '../../state/session';
import { Banner, Card, Disclosure, EmptyState, Line, PageHeader, SectionHeader } from '../../ui';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { LastSyncedLine } from './LastSyncedLine';

const show = (value: unknown): string =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

function ConflictLine({ conflict, onDone }: { conflict: ConflictItem; onDone: () => void }) {
  const { conflicts } = useServices();
  const prefs = useSessionStore((s) => s.preferences);
  const open = conflict.resolvedAt === null;
  const field = conflict.field ?? conflict.recordType;
  const sub =
    conflict.reason === 'updateAfterDelete'
      ? t('conflict.updateAfterDelete')
      : `${t('conflict.kept', { value: show(conflict.keptValue) })} · ${t('conflict.replaced', { value: show(conflict.replacedValue) })}`;
  return (
    <Line
      title={t('conflict.what', { type: conflict.recordType, field })}
      sub={
        <>
          {sub}
          <span className="sub2">
            {open ? formatDate(conflict.createdAt, prefs) : t('conflict.resolved')}
          </span>
        </>
      }
      actions={
        open ? (
          <>
            {conflicts.canRestore(conflict) ? (
              <button
                type="button"
                className="linkbtn"
                aria-label={t('conflict.restoreLabel', { field })}
                onClick={() => void conflicts.restore(conflict).then(onDone)}
              >
                {t('conflict.restore')}
              </button>
            ) : null}
            <button
              type="button"
              className="linkbtn"
              aria-label={t('conflict.dismissLabel', { field })}
              onClick={() => void conflicts.dismiss(conflict).then(onDone)}
            >
              {t('conflict.dismiss')}
            </button>
          </>
        ) : null
      }
    />
  );
}

/** Sync activity: conflicts to review (with "restore this value") and changes the server refused. */
export function SyncPage() {
  const { sync, conflicts } = useServices();
  const householdId = useHouseholdId();
  const client = useQueryClient();
  const online = useConnectivityStore((s) => s.online);
  const pending = useConnectivityStore((s) => s.pendingCount);
  const lastSyncedAt = useConnectivityStore((s) => s.lastSyncedAt);
  const problems = useQuery({
    queryKey: ['syncProblems', lastSyncedAt],
    queryFn: () => sync.problems(),
  });
  const list = useQuery({
    queryKey: ['syncConflicts', householdId, lastSyncedAt],
    queryFn: () => conflicts.list(householdId),
    enabled: householdId !== '',
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['syncConflicts'] });
  const open = (list.data ?? []).filter((c) => c.resolvedAt === null);
  const done = (list.data ?? []).filter((c) => c.resolvedAt !== null);
  const lede = !online
    ? t('sync.offline')
    : pending === 0
      ? t('sync.upToDate')
      : pending === 1
        ? t('sync.pendingOne')
        : t('sync.pending', { count: pending });

  return (
    <>
      <PageHeader title={t('syncPage.title')} lede={lede} />
      <div className="two">
        <div className="stack">
          <Card>
            <SectionHeader title={t('syncPage.status')} />
            <LastSyncedLine />
          </Card>
          <Card>
            <SectionHeader title={t('conflict.title')} />
            {list.isError ? (
              <Banner tone="warn">{t('ui.loadFailed')}</Banner>
            ) : open.length === 0 ? (
              <EmptyState>{t('conflict.none')}</EmptyState>
            ) : (
              <ul>
                {open.map((c) => (
                  <ConflictLine key={c.id} conflict={c} onDone={() => void refresh()} />
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="stack">
          {done.length > 0 ? (
            <Card>
              <Disclosure title={t('conflict.history', { count: String(done.length) })}>
                <ul>
                  {done.map((c) => (
                    <ConflictLine key={c.id} conflict={c} onDone={() => void refresh()} />
                  ))}
                </ul>
              </Disclosure>
            </Card>
          ) : null}
          <Card>
            <SectionHeader title={t('syncPage.problems')} />
            {problems.data?.length === 0 ? (
              <EmptyState>{t('syncPage.noProblems')}</EmptyState>
            ) : null}
            <ul>
              {problems.data?.map((p) => (
                <Line
                  key={p.id}
                  title={t('sync.error', { code: p.code })}
                  sub={`${p.recordType} · ${p.at}`}
                />
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
