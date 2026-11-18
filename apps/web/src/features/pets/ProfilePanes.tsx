import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { isMeal, rankPets } from '../../application/ranking';
import type { StoredRecord } from '../../application/ports/record-store';
import type { SnoozeFor } from '../../application/today-service';
import type { TodayItem } from '../../application/today';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Card, Disclosure, EmptyState, SectionHeader } from '../../ui';
import { CareLists } from '../care/CareLists';
import { Flow } from '../shared/Flow';
import type { FlowPlan } from '../shared/Flow';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useNow } from '../shared/use-now';
import { useWideScreen } from '../shared/use-wide-screen';
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

const OVERVIEW_PLAN: FlowPlan = {
  wide: [
    [1, 'upnext'],
    [1.25, 'weight'],
    [1, 'details'],
  ],
  mid: [
    [1, 'upnext', 'details'],
    [1, 'weight'],
  ],
};

export function OverviewPane({ pet, onEdit }: { pet: StoredRecord; onEdit: () => void }) {
  const { view, now, tz, act } = usePetToday(pet.id);
  const wide = useWideScreen();
  const open = useMemo(
    () =>
      view ? (rankPets([{ id: pet.id, name: '', archived: false }], view, now)[0]?.open ?? []) : [],
    [view, now, pet.id],
  );
  const upnext = (
    <Card data-area="upnext">
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
  );
  const details = wide ? (
    <Card data-area="details">
      <SectionHeader title={t('pet.details')} />
      <PetOverview pet={pet} onEdit={onEdit} />
    </Card>
  ) : (
    <Disclosure title={t('pet.details')} hint={t('pet.detailsHint')}>
      <PetOverview pet={pet} />
    </Disclosure>
  );
  const weight = <WeightCard petId={pet.id} />;
  return (
    <Flow layout="overview" panels={{ upnext, details, weight }} plan={OVERVIEW_PLAN}>
      <div className="stack">
        {upnext}
        {details}
      </div>
      {weight}
    </Flow>
  );
}

export function CarePane({ pet }: { pet: StoredRecord }) {
  const { view, now, tz, act } = usePetToday(pet.id);
  const rows = useMemo(() => {
    if (!view) return [];
    const ranked = rankPets([{ id: pet.id, name: '', archived: false }], view, now)[0]?.open ?? [];
    return [
      ...ranked.filter((i) => i.status !== 'soon').map((i) => ({ item: i, status: i.status })),
      ...view.snoozed.filter((i) => !isMeal(i)).map((item) => ({ item, status: undefined })),
      ...view.done.filter((i) => !isMeal(i)).map((item) => ({ item, status: undefined })),
    ];
  }, [view, now, pet.id]);
  const doneCount = view?.done.filter((i) => !isMeal(i)).length ?? 0;
  const today = (
    <Card data-area="today">
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
      {view && rows.length === 0 ? <EmptyState>{t('care.todayEmpty')}</EmptyState> : null}
    </Card>
  );
  return <CareLists pet={pet} today={today} />;
}
