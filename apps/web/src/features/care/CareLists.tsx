import { scheduleSchema } from '@petcare/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { StoredRecord } from '../../application/ports/record-store';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Card, Disclosure, EmptyState, Line, SectionHeader, Switch } from '../../ui';
import { useHealthList } from '../health/hooks';
import { Flow } from '../shared/Flow';
import type { FlowPlan } from '../shared/Flow';
import { useCan, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useWideScreen } from '../shared/use-wide-screen';
import { MealPresets } from './MealPresets';
import { ReminderSheet } from './ReminderSheet';
import { useAudienceLabel } from './audience';
import type { ReminderTarget } from './ReminderSheet';
import { repeatText } from './repeat-text';

type Row = { type: 'reminder' | 'careRoutine'; record: StoredRecord };

const byTitle = (a: Row, b: Row) =>
  String(a.record.data.title ?? '').localeCompare(String(b.record.data.title ?? ''));

/** The rows of one list: the title, when it repeats, an Edit button and the on/off switch. */
function Rows({ rows, label, onEdit }: { rows: Row[]; label: string; onEdit: (row: Row) => void }) {
  const { health } = useServices();
  const prefs = useSessionStore((s) => s.preferences);
  const canUpdateReminder = useCan('update', 'reminder');
  const canUpdateRoutine = useCan('update', 'careRoutine');
  const audienceLabel = useAudienceLabel(rows.map((r) => r.record.data.audienceUserId));
  return (
    <ul aria-label={label}>
      {rows.map((row) => {
        const { record, type } = row;
        const title = String(record.data.title ?? '');
        const active = record.data.active === true;
        const schedule = scheduleSchema.safeParse(record.data.schedule);
        const when = schedule.success ? repeatText(schedule.data, prefs) : '';
        const audience = type === 'reminder' ? record.data.audienceUserId : null;
        const canUpdate = type === 'reminder' ? canUpdateReminder : canUpdateRoutine;
        return (
          <Line
            key={record.id}
            title={title}
            sub={[when, audienceLabel(audience), active ? '' : t('routine.paused')]
              .filter(Boolean)
              .join(' · ')}
            testId="reminder-row"
            actions={
              canUpdate ? (
                <>
                  <button
                    type="button"
                    className="linkbtn"
                    aria-label={t(
                      type === 'reminder' ? 'reminder.editLabel' : 'routine.editLabel',
                      { name: title },
                    )}
                    onClick={() => onEdit(row)}
                  >
                    {t('reminder.edit')}
                  </button>
                  <Switch
                    checked={active}
                    label={t('reminder.switchLabel', { name: title })}
                    onChange={(next) => void health.update(type, record.id, { active: next })}
                  />
                </>
              ) : null
            }
          />
        );
      })}
    </ul>
  );
}

const CARE_PLAN: FlowPlan = {
  wide: [
    [1, 'today'],
    [1.2, 'reminders'],
    [1, 'feeding', 'sheet'],
  ],
  mid: [
    [1, 'today', 'feeding', 'sheet'],
    [1, 'reminders'],
  ],
};

/**
 * The Care tab's panels: Today (given), Reminders (with any legacy care routine that is not feeding)
 * and the Feeding disclosure, which lists the feeding routines. Both open the same sheet.
 */
export function CareLists({ pet, today }: { pet: StoredRecord; today: ReactNode }) {
  const householdId = useHouseholdId();
  const wide = useWideScreen();
  const { health } = useServices();
  const canCreate = useCan('create', 'reminder');
  const [target, setTarget] = useState<ReminderTarget | null>(null);
  const reminders = useQuery({
    queryKey: ['reminder', householdId],
    queryFn: () => health.all('reminder', householdId),
    enabled: householdId !== '',
  });
  const routines = useHealthList('careRoutine', pet.id);
  const petName = String(pet.data.name ?? '');

  const reminderRows: Row[] = (reminders.data ?? [])
    .filter((r) => r.data.petId === pet.id || !r.data.petId)
    .map((record) => ({ type: 'reminder' as const, record }));
  const routineRows: Row[] = (routines.data ?? []).map((record) => ({
    type: 'careRoutine' as const,
    record,
  }));
  const listed = [...reminderRows, ...routineRows.filter((r) => r.record.data.kind !== 'feeding')];
  const meals = routineRows.filter((r) => r.record.data.kind === 'feeding');
  const edit = (row: Row) => setTarget({ mode: 'edit', ...row });

  const feeding = (
    <>
      <p className="muted">{t('feeding.body')}</p>
      <MealPresets petId={pet.id} petName={petName} />
      {meals.length > 0 ? (
        <Rows rows={meals.sort(byTitle)} label={t('feeding.title')} onEdit={edit} />
      ) : null}
    </>
  );

  const remindersCard = (
    <Card data-area="reminders">
      <SectionHeader
        title={t('reminder.title')}
        {...(canCreate
          ? {
              action: {
                label: t('reminder.addShort'),
                ariaLabel: t('reminder.addLabel', { name: petName }),
                onClick: () => setTarget({ mode: 'new', petId: pet.id, petName }),
              },
            }
          : {})}
      />
      {listed.length > 0 ? (
        <Rows rows={listed.sort(byTitle)} label={t('reminder.title')} onEdit={edit} />
      ) : reminders.data && routines.data ? (
        <EmptyState>{t('reminder.empty')}</EmptyState>
      ) : null}
    </Card>
  );
  const feedingCard = wide ? (
    <Card data-area="feeding">
      <SectionHeader title={t('feeding.title')} />
      {feeding}
    </Card>
  ) : (
    <Disclosure title={t('feeding.title')} hint={t('feeding.hint')}>
      {feeding}
    </Disclosure>
  );
  const sheet = <ReminderSheet target={target} onClose={() => setTarget(null)} />;
  return (
    <Flow
      layout="care"
      panels={{ today, reminders: remindersCard, feeding: feedingCard, sheet }}
      plan={CARE_PLAN}
    >
      {today}
      <div className="stack">
        {remindersCard}
        {feedingCard}
        {sheet}
      </div>
    </Flow>
  );
}
