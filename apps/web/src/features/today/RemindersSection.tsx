import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { InvalidInput } from '../../application/pet-service';
import type { ScheduleFormValues } from '../../application/schedule-form';
import { emptyScheduleForm, scheduleFromForm } from '../../application/schedule-form';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Banner, Button } from '../../ui';
import { errorsFor, useToday } from '../health/hooks';
import { RecordForm } from '../health/RecordForm';
import type { FieldSpec } from '../health/RecordForm';
import { ScheduleFields } from '../health/ScheduleFields';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

/** Custom reminders for the household or one pet. */
export function RemindersSection({ pets }: { pets: { id: string; name: string }[] }) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const canCreate = useCan('create', 'reminder');
  const canUpdate = useCan('update', 'reminder');
  const canDelete = useCanDelete('reminder');
  const today = useToday();
  const list = useQuery({
    queryKey: ['reminder', householdId],
    queryFn: () => health.all('reminder', householdId),
    enabled: householdId !== '',
  });
  const [values, setValues] = useState<Record<string, string>>({ petId: '' });
  const [schedule, setSchedule] = useState<ScheduleFormValues>({
    ...emptyScheduleForm(today),
    kind: 'once',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scheduleError, setScheduleError] = useState<string | undefined>();

  const fields: FieldSpec[] = [
    { name: 'title', label: t('reminder.name') },
    {
      name: 'petId',
      label: t('reminder.pet'),
      type: 'select',
      options: [
        { value: '', label: t('reminder.noPet') },
        ...pets.map((p) => ({ value: p.id, label: p.name })),
      ],
    },
    { name: 'note', label: t('reminder.note') },
  ];

  const submit = async () => {
    try {
      await health.add('reminder', householdId, {
        ...values,
        active: true,
        schedule: scheduleFromForm(schedule, tz),
      });
      setValues({ petId: values.petId ?? '' });
      setSchedule({ ...emptyScheduleForm(today), kind: 'once' });
      setErrors({});
      setScheduleError(undefined);
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      const field = e.path.split('.')[0] ?? '';
      setScheduleError(field === 'schedule' ? t('form.invalid') : undefined);
      setErrors(field === 'schedule' ? {} : errorsFor(e.path, t('form.invalid')));
    }
  };

  const rows = list.data ?? [];
  return (
    <section className="flex flex-col gap-4" aria-labelledby="reminders-title">
      <h2 id="reminders-title" className="text-xl font-semibold">
        {t('reminder.title')}
      </h2>
      {canCreate ? (
        <RecordForm
          title={t('reminder.add')}
          fields={fields}
          values={values}
          errors={errors}
          onChange={setValues}
          onSubmit={() => void submit()}
          submitLabel={t('reminder.add')}
        >
          <ScheduleFields values={schedule} onChange={setSchedule} error={scheduleError} />
        </RecordForm>
      ) : null}
      {rows.length === 0 ? <Banner>{t('reminder.empty')}</Banner> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const title = String(r.data.title);
          const active = r.data.active === true;
          return (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card p-3"
            >
              <span>
                <strong>{title}</strong>
                {active ? '' : ` · ${t('routine.paused')}`}
              </span>
              <span className="flex gap-2">
                {canUpdate ? (
                  <Button
                    variant="secondary"
                    aria-label={t(active ? 'routine.pauseLabel' : 'routine.resumeLabel', {
                      name: title,
                    })}
                    onClick={() => void health.update('reminder', r.id, { active: !active })}
                  >
                    {t(active ? 'routine.pause' : 'routine.resume')}
                  </Button>
                ) : null}
                {canDelete(r.createdBy) ? (
                  <Button
                    variant="secondary"
                    aria-label={t('form.deleteLabel', { name: title })}
                    onClick={() => void health.remove('reminder', r.id)}
                  >
                    {t('form.delete')}
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
