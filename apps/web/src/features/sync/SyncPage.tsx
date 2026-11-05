import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConflictItem } from '../../application/ports/remote-api';
import { t } from '../../i18n/t';
import { formatDate } from '../../lib/format';
import { useConnectivityStore } from '../../state/connectivity';
import { useSessionStore } from '../../state/session';
import { Banner, Button } from '../../ui';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

const show = (value: unknown): string =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

function ConflictCard({ conflict, onDone }: { conflict: ConflictItem; onDone: () => void }) {
  const { conflicts } = useServices();
  const prefs = useSessionStore((s) => s.preferences);
  const open = conflict.resolvedAt === null;
  const field = conflict.field ?? conflict.recordType;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3">
      <p>
        <strong>{t('conflict.what', { type: conflict.recordType, field })}</strong>{' '}
        <span className="text-sm">{formatDate(conflict.createdAt, prefs)}</span>
      </p>
      {conflict.reason === 'updateAfterDelete' ? (
        <p>{t('conflict.updateAfterDelete')}</p>
      ) : (
        <>
          <p>{t('conflict.kept', { value: show(conflict.keptValue) })}</p>
          <p>{t('conflict.replaced', { value: show(conflict.replacedValue) })}</p>
        </>
      )}
      {open ? (
        <div className="flex gap-2">
          {conflicts.canRestore(conflict) ? (
            <Button
              variant="secondary"
              aria-label={t('conflict.restoreLabel', { field })}
              onClick={() => void conflicts.restore(conflict).then(onDone)}
            >
              {t('conflict.restore')}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            aria-label={t('conflict.dismissLabel', { field })}
            onClick={() => void conflicts.dismiss(conflict).then(onDone)}
          >
            {t('conflict.dismiss')}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">{t('conflict.resolved')}</p>
      )}
    </li>
  );
}

/** Sync activity: conflicts to review (with "restore this value") and changes the server refused. */
export function SyncPage() {
  const { sync, conflicts } = useServices();
  const householdId = useHouseholdId();
  const client = useQueryClient();
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

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('syncPage.title')}</h1>
      <Button className="self-start" onClick={() => void sync.syncNow()}>
        {t('sync.now')}
      </Button>

      <section aria-labelledby="conflicts-title" className="flex flex-col gap-2">
        <h2 id="conflicts-title" className="text-xl font-semibold">
          {t('conflict.title')}
        </h2>
        {open.length === 0 ? <Banner>{t('conflict.none')}</Banner> : null}
        <ul className="flex flex-col gap-2">
          {open.map((c) => (
            <ConflictCard key={c.id} conflict={c} onDone={() => void refresh()} />
          ))}
        </ul>
        {done.length > 0 ? (
          <details>
            <summary>{t('conflict.history', { count: String(done.length) })}</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {done.map((c) => (
                <ConflictCard key={c.id} conflict={c} onDone={() => void refresh()} />
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="problems-title" className="flex flex-col gap-2">
        <h2 id="problems-title" className="text-xl font-semibold">
          {t('syncPage.problems')}
        </h2>
        {problems.data?.length === 0 ? <p>{t('syncPage.noProblems')}</p> : null}
        <ul className="flex flex-col gap-2">
          {problems.data?.map((p) => (
            <li key={p.id} className="rounded-lg border border-line bg-card p-3 text-sm">
              <strong>{p.code}</strong> · {p.recordType} · {p.at}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
