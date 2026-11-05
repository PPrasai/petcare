import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { completable, skippable } from '../../application/today';
import type { TodayItem } from '../../application/today';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useSessionStore } from '../../state/session';
import { Banner, Button, SelectField } from '../../ui';
import { useCan, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { RemindersSection } from './RemindersSection';

const time = (iso: string, tz: string) =>
  new Date(iso).toLocaleString(undefined, { timeZone: tz, dateStyle: 'short', timeStyle: 'short' });

/** What needs doing: overdue, today and coming up, for the household or one pet. */
export function TodayPage() {
  const { today, pets } = useServices();
  const householdId = useHouseholdId();
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const userId = useSessionStore((s) => s.user?.id ?? '');
  const canLog = useCan('create', 'careCompletion');
  const [petId, setPetId] = useState('');

  const petList = useQuery({
    queryKey: ['pet', householdId],
    queryFn: () => pets.list(householdId),
    enabled: householdId !== '',
  });
  const view = useQuery({
    queryKey: ['today', householdId, { petId }],
    queryFn: () =>
      today.view(householdId, { now: new Date(), tz, userId, petId: petId === '' ? null : petId }),
    enabled: householdId !== '',
  });
  const petOptions = (petList.data ?? []).map((p) => ({ id: p.id, name: String(p.data.name) }));
  const data = view.data;
  const empty =
    data &&
    data.overdue.length + data.today.length + data.upcoming.length + data.snoozed.length === 0;

  const act = (item: TodayItem, skipped: boolean) =>
    void today.complete(householdId, item, skipped, new Date());
  const snooze = (item: TodayItem, until: 'hour' | 'tomorrow') =>
    void today.snooze(householdId, userId, item, until, new Date(), tz);

  const row = (item: TodayItem, actions: boolean) => {
    const label = `${item.title}${item.petName ? ` (${item.petName})` : ''}`;
    return (
      <li
        key={item.key}
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card p-3"
      >
        <span>
          <strong>{item.title}</strong>
          {item.petName ? <span className="text-muted"> · {item.petName}</span> : null}
          <span className="block text-sm">
            {t(`today.source.${item.sourceType}` as MessageKey)} · {time(item.occurrenceAt, tz)}
            {item.snoozedUntil
              ? ` · ${t('today.snoozedUntil', { when: time(item.snoozedUntil, tz) })}`
              : ''}
            {item.doneBy
              ? ` · ${t(item.skipped ? 'today.skippedBy' : 'today.doneBy', { who: t(item.doneBy === 'me' ? 'today.you' : 'today.someone') })}`
              : ''}
          </span>
        </span>
        {actions ? (
          <span className="flex flex-wrap gap-2">
            {completable(item.sourceType) && canLog ? (
              <Button
                aria-label={t('today.doneLabel', { name: label })}
                onClick={() => act(item, false)}
              >
                {t('today.done')}
              </Button>
            ) : null}
            {skippable(item.sourceType) && canLog ? (
              <Button
                variant="secondary"
                aria-label={t('today.skipLabel', { name: label })}
                onClick={() => act(item, true)}
              >
                {t('today.skip')}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              aria-label={t('today.snoozeHourLabel', { name: label })}
              onClick={() => snooze(item, 'hour')}
            >
              {t('today.snoozeHour')}
            </Button>
            <Button
              variant="secondary"
              aria-label={t('today.snoozeTomorrowLabel', { name: label })}
              onClick={() => snooze(item, 'tomorrow')}
            >
              {t('today.snoozeTomorrow')}
            </Button>
          </span>
        ) : null}
      </li>
    );
  };

  const section = (id: string, title: string, items: TodayItem[], actions = true) =>
    items.length > 0 ? (
      <section aria-labelledby={`today-${id}`} className="flex flex-col gap-2">
        <h2 id={`today-${id}`} className="text-xl font-semibold">
          {title} <span className="text-sm font-normal">({items.length})</span>
        </h2>
        <ul className="flex flex-col gap-2">{items.map((i) => row(i, actions))}</ul>
      </section>
    ) : null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('today.title')}</h1>
      {petOptions.length > 1 ? (
        <SelectField
          label={t('today.filter')}
          value={petId}
          onChange={(e) => setPetId(e.target.value)}
          options={[
            { value: '', label: t('today.allPets') },
            ...petOptions.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      ) : null}
      {empty ? <Banner>{t('today.empty')}</Banner> : null}
      {data ? (
        <>
          {section('overdue', t('today.overdue'), data.overdue)}
          {section('today', t('today.dueToday'), data.today)}
          {section('snoozed', t('today.snoozed'), data.snoozed, false)}
          {section('done', t('today.doneToday'), data.done, false)}
          {section('upcoming', t('today.upcoming'), data.upcoming, false)}
        </>
      ) : null}
      <RemindersSection pets={petOptions} />
    </div>
  );
}
