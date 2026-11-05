import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useCan, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

export function PetsPage() {
  const { pets } = useServices();
  const householdId = useHouseholdId();
  const canCreate = useCan('create', 'pet');
  const list = useQuery({
    queryKey: ['pet', householdId],
    queryFn: () => pets.list(householdId),
    enabled: householdId !== '',
  });

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('pets.title')}</h1>
        {canCreate ? (
          <Link
            to="/pets/new"
            className="inline-flex min-h-11 items-center rounded-lg border border-brand bg-brand px-4 font-medium text-brand-ink"
          >
            {t('pets.add')}
          </Link>
        ) : null}
      </div>
      {list.data && list.data.length === 0 ? <p>{t('pets.empty')}</p> : null}
      <ul className="flex flex-col gap-2">
        {list.data?.map((pet) => (
          <li key={pet.id}>
            <Link
              to="/pets/$petId"
              params={{ petId: pet.id }}
              search={{ tab: 'overview' }}
              className="flex min-h-11 items-center justify-between rounded-lg border border-line bg-card p-3"
            >
              <span>
                <strong>{String(pet.data.name)}</strong>{' '}
                <span className="text-muted">
                  {t(`pets.species.${String(pet.data.species)}` as MessageKey)}
                </span>
                {pet.data.archivedAt ? (
                  <span className="ml-2 rounded border border-line px-1 text-sm">
                    {t('pets.archived')}
                  </span>
                ) : null}
              </span>
              {pet.pending ? <span className="text-sm text-muted">{t('pets.pending')}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
