import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { rankPets } from '../../application/ranking';
import type { StoredRecord } from '../../application/ports/record-store';
import type { SnoozeFor } from '../../application/today-service';
import type { TodayItem } from '../../application/today';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Card, Disclosure } from '../../ui';
import { RemindersSection } from '../care/RemindersSection';
import { RoutinesPanel } from '../care/RoutinesPanel';
import { DocumentsPanel } from '../documents/DocumentsPanel';
import { ConditionsPanel } from '../health/ConditionsPanel';
import { MedicationsPanel } from '../health/MedicationsPanel';
import { VaccinationsPanel } from '../health/VaccinationsPanel';
import { VisitsPanel } from '../health/VisitsPanel';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useNow } from '../shared/use-now';
import { MeasurementsPanel } from './MeasurementsPanel';
import { PetOverview } from './PetOverview';
import { TaskRow } from './TaskRow';
import type { TaskAction } from './TaskRow';
import { WeightCard } from './WeightCard';

/** "Up next" shows the first few; the Care tab has the day's full list. */
const UP_NEXT_MAX = 5;

/** One pet's tasks, kept fresh by the `today` query key that every local write invalidates. */
function usePetToday(petId: string) {
  const { today } = useServices();
  const householdId = useHouseholdId();
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const userId = useSessionStore((s) => s.user?.id ?? '');
  const now = useNow();
  const view = useQuery({
    queryKey: ['today', householdId, { petId }],
    queryFn: () => today.view(householdId, { now: new Date(), tz, userId, petId }),
    enabled: householdId !== '',
  });
  const act = (item: TodayItem, action: TaskAction) => {
    if (action === 'done' || action === 'skip') {
      void today.complete(householdId, item, action === 'skip', new Date());
    } else {
      const until: SnoozeFor = action === 'snoozeHour' ? 'hour' : 'tomorrow';
      void today.snooze(householdId, userId, item, until, new Date(), tz);
    }
  };
  return { view: view.data, now, tz, act };
}

export function OverviewPane({ pet }: { pet: StoredRecord }) {
  const { view, now, tz, act } = usePetToday(pet.id);
  const open = useMemo(
    () =>
      view ? (rankPets([{ id: pet.id, name: '', archived: false }], view, now)[0]?.open ?? []) : [],
    [view, now, pet.id],
  );
  return (
    <div className="two">
      <div className="stack">
        <Card>
          <div className="sech">
            <h2>{t('task.upNext')}</h2>
          </div>
          {open.slice(0, UP_NEXT_MAX).map((item) => (
            <TaskRow
              key={item.key}
              item={item}
              status={item.status}
              now={now}
              tz={tz}
              onAction={(action) => act(item, action)}
            />
          ))}
          {view && open.length === 0 ? <p className="empty">{t('task.upNextEmpty')}</p> : null}
        </Card>
        <Disclosure title={t('pet.details')} hint={t('pet.detailsHint')}>
          <PetOverview pet={pet} />
        </Disclosure>
      </div>
      <WeightCard petId={pet.id} />
    </div>
  );
}

export function HealthPane({ pet }: { pet: StoredRecord }) {
  return (
    <div className="two">
      <div className="stack">
        <Card>
          <MeasurementsPanel petId={pet.id} />
        </Card>
        <Card>
          <VaccinationsPanel petId={pet.id} species={String(pet.data.species)} />
        </Card>
      </div>
      <div className="stack">
        <Card>
          <MedicationsPanel petId={pet.id} />
        </Card>
        <Card>
          <VisitsPanel petId={pet.id} />
        </Card>
        <Card>
          <ConditionsPanel petId={pet.id} />
        </Card>
      </div>
    </div>
  );
}

export function CarePane({ pet }: { pet: StoredRecord }) {
  const { view, now, tz, act } = usePetToday(pet.id);
  const rows = useMemo(() => {
    if (!view) return [];
    const ranked = rankPets([{ id: pet.id, name: '', archived: false }], view, now)[0]?.open ?? [];
    return [
      ...ranked.filter((i) => i.status !== 'soon').map((i) => ({ item: i, status: i.status })),
      ...view.snoozed.map((item) => ({ item, status: undefined })),
      ...view.done.map((item) => ({ item, status: undefined })),
    ];
  }, [view, now, pet.id]);
  const doneCount = view?.done.length ?? 0;
  return (
    <div className="two">
      <Card>
        <div className="sech">
          <h2>{t('care.today')}</h2>
          <span className="muted">
            {t('care.doneCount', { done: doneCount, total: rows.length })}
          </span>
        </div>
        {rows.map(({ item, status }) => (
          <TaskRow
            key={item.key}
            item={item}
            {...(status ? { status } : {})}
            now={now}
            tz={tz}
            onAction={(action) => act(item, action)}
          />
        ))}
        {view && rows.length === 0 ? <p className="empty">{t('care.todayEmpty')}</p> : null}
      </Card>
      <div className="stack">
        <Card>
          <RemindersSection petId={pet.id} pets={[{ id: pet.id, name: String(pet.data.name) }]} />
        </Card>
        <Card>
          <RoutinesPanel petId={pet.id} />
        </Card>
      </div>
    </div>
  );
}

export function FilesPane({ pet }: { pet: StoredRecord }) {
  return (
    <Card>
      <DocumentsPanel petId={pet.id} />
    </Card>
  );
}
