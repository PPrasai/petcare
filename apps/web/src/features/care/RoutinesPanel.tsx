import { useState } from 'react';
import { InvalidInput } from '../../application/pet-service';
import { emptyScheduleForm, scheduleFromForm } from '../../application/schedule-form';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useSessionStore } from '../../state/session';
import { Banner, Button } from '../../ui';
import { errorsFor, useHealthList, useToday } from '../health/hooks';
import { RecordForm } from '../health/RecordForm';
import type { FieldSpec } from '../health/RecordForm';
import { ScheduleFields } from '../health/ScheduleFields';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

const KINDS = ['feeding', 'walk', 'grooming', 'fleaTick', 'deworming', 'custom'] as const;

const FIELDS: FieldSpec[] = [
  {
    name: 'kind',
    label: t('routine.kind'),
    type: 'select',
    options: KINDS.map((k) => ({ value: k, label: t(`routine.kind.${k}` as MessageKey) })),
  },
  { name: 'title', label: t('routine.name') },
  { name: 'note', label: t('routine.note') },
];

/** Recurring care of one pet: feeding, walks, grooming, treatments. */
export function RoutinesPanel({ petId }: { petId: string }) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const canCreate = useCan('create', 'careRoutine');
  const canUpdate = useCan('update', 'careRoutine');
  const canDelete = useCanDelete('careRoutine');
  const today = useToday();
  const list = useHealthList('careRoutine', petId);
  const [values, setValues] = useState<Record<string, string>>({ kind: 'feeding' });
  const [schedule, setSchedule] = useState(emptyScheduleForm(today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scheduleError, setScheduleError] = useState<string | undefined>();

  const submit = async () => {
    try {
      await health.add('careRoutine', householdId, {
        petId,
        ...values,
        active: true,
        schedule: scheduleFromForm(schedule, tz),
      });
      setValues({ kind: values.kind ?? 'feeding' });
      setSchedule(emptyScheduleForm(today));
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
    <section className="flex flex-col gap-4" aria-labelledby="routine-title">
      <h2 id="routine-title" className="text-xl font-semibold">
        {t('routine.title')}
      </h2>
      {canCreate ? (
        <RecordForm
          title={t('routine.add')}
          fields={FIELDS}
          values={values}
          errors={errors}
          onChange={setValues}
          onSubmit={() => void submit()}
          submitLabel={t('routine.add')}
        >
          <ScheduleFields values={schedule} onChange={setSchedule} error={scheduleError} />
        </RecordForm>
      ) : null}
      {rows.length === 0 ? <Banner>{t('routine.empty')}</Banner> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const title = String(r.data.title);
          const active = r.data.active === true;
          return (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3"
            >
              <div>
                <strong>{title}</strong>{' '}
                <span className="text-sm">
                  {t(`routine.kind.${String(r.data.kind)}` as MessageKey)}
                  {active ? '' : ` · ${t('routine.paused')}`}
                </span>
              </div>
              <div className="flex gap-2">
                {canUpdate ? (
                  <Button
                    variant="secondary"
                    aria-label={t(active ? 'routine.pauseLabel' : 'routine.resumeLabel', {
                      name: title,
                    })}
                    onClick={() => void health.update('careRoutine', r.id, { active: !active })}
                  >
                    {t(active ? 'routine.pause' : 'routine.resume')}
                  </Button>
                ) : null}
                {canDelete(r.createdBy) ? (
                  <Button
                    variant="secondary"
                    aria-label={t('form.deleteLabel', { name: title })}
                    onClick={() => void health.remove('careRoutine', r.id)}
                  >
                    {t('form.delete')}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
