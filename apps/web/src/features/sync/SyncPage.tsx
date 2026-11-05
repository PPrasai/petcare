import { useQuery } from '@tanstack/react-query';
import { t } from '../../i18n/t';
import { Button } from '../../ui';
import { useServices } from '../shared/services-context';

/** Sync problems (rejected changes). Slice 13 adds conflicts and "restore this value". */
export function SyncPage() {
  const { sync } = useServices();
  const problems = useQuery({ queryKey: ['syncProblems'], queryFn: () => sync.problems() });
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('syncPage.title')}</h1>
      <Button
        className="self-start"
        onClick={() => void sync.syncNow().then(() => problems.refetch())}
      >
        {t('sync.now')}
      </Button>
      <h2 className="font-semibold">{t('syncPage.problems')}</h2>
      {problems.data?.length === 0 ? <p>{t('syncPage.noProblems')}</p> : null}
      <ul className="flex flex-col gap-2">
        {problems.data?.map((p) => (
          <li key={p.id} className="rounded-lg border border-line bg-card p-3 text-sm">
            <strong>{p.code}</strong> · {p.recordType} · {p.at}
          </li>
        ))}
      </ul>
    </div>
  );
}
