import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { EmergencyPanel } from '../emergency/EmergencyPanel';
import { DocumentsPanel } from '../documents/DocumentsPanel';
import { RoutinesPanel } from '../care/RoutinesPanel';
import { ConditionsPanel } from '../health/ConditionsPanel';
import { MedicationsPanel } from '../health/MedicationsPanel';
import { VaccinationsPanel } from '../health/VaccinationsPanel';
import { VisitsPanel } from '../health/VisitsPanel';
import { MeasurementsPanel } from './MeasurementsPanel';
import { PetOverview } from './PetOverview';

export const PET_TABS = [
  'overview',
  'health',
  'vaccinations',
  'medications',
  'visits',
  'conditions',
  'routines',
  'documents',
  'emergency',
] as const;
export type PetTab = (typeof PET_TABS)[number];

export const parseTab = (value: unknown): PetTab =>
  PET_TABS.includes(value as PetTab) ? (value as PetTab) : 'overview';

/** A pet: header, section tabs, and the selected section. */
export function PetDetailPage({ petId, tab }: { petId: string; tab: PetTab }) {
  const { pets } = useServices();
  const householdId = useHouseholdId();
  const pet = useQuery({
    queryKey: ['pet', householdId, { id: petId }],
    queryFn: () => pets.get(petId),
    enabled: householdId !== '',
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link to="/pets" className="underline">
        {t('pets.back')}
      </Link>
      {pet.isSuccess && !pet.data ? <p>{t('pets.notFound')}</p> : null}
      {pet.data ? (
        <>
          <h1 className="text-2xl font-semibold">{String(pet.data.data.name)}</h1>
          <nav aria-label={t('pets.tabs')} className="flex gap-2 border-b border-line">
            {PET_TABS.map((name) => (
              <Link
                key={name}
                to="/pets/$petId"
                params={{ petId }}
                search={{ tab: name }}
                className="inline-flex min-h-11 items-center px-3"
                activeOptions={{ includeSearch: true }}
                activeProps={{
                  className: 'border-b-2 border-brand font-semibold',
                  'aria-current': 'page',
                }}
              >
                {t(`pets.tab.${name}` as MessageKey)}
              </Link>
            ))}
          </nav>
          {tab === 'overview' ? <PetOverview pet={pet.data} /> : null}
          {tab === 'health' ? <MeasurementsPanel petId={petId} /> : null}
          {tab === 'vaccinations' ? (
            <VaccinationsPanel petId={petId} species={String(pet.data.data.species)} />
          ) : null}
          {tab === 'medications' ? <MedicationsPanel petId={petId} /> : null}
          {tab === 'visits' ? <VisitsPanel petId={petId} /> : null}
          {tab === 'routines' ? <RoutinesPanel petId={petId} /> : null}
          {tab === 'documents' ? <DocumentsPanel petId={petId} /> : null}
          {tab === 'emergency' ? (
            <EmergencyPanel petId={petId} petName={String(pet.data.data.name)} />
          ) : null}
          {tab === 'conditions' ? <ConditionsPanel petId={petId} /> : null}
        </>
      ) : null}
    </div>
  );
}
