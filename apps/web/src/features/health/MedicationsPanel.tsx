import { useState } from 'react';
import { courseEnded, doseSlots } from '../../application/health-logic';
import type { DoseSlot } from '../../application/health-logic';
import { InvalidInput } from '../../application/pet-service';
import type { StoredRecord } from '../../application/ports/record-store';
import { emptyScheduleForm, scheduleFromForm } from '../../application/schedule-form';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Banner, Button } from '../../ui';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { errorsFor, useHealthList, useToday } from './hooks';
import { RecordForm } from './RecordForm';
import type { FieldSpec } from './RecordForm';
import { ScheduleFields } from './ScheduleFields';

const UNITS = ['mg', 'ml', 'tablet', 'capsule', 'drop', 'puff', 'application', 'other'] as const;

const FIELDS: FieldSpec[] = [
  { name: 'name', label: t('med.name') },
  { name: 'dose', label: t('med.dose'), type: 'number' },
  {
    name: 'doseUnit',
    label: t('med.doseUnit'),
    type: 'select',
    options: [{ value: '', label: '' }, ...UNITS.map((u) => ({ value: u, label: u }))],
  },
  { name: 'note', label: t('med.note') },
];

/** Medications of one pet: courses, a dose list to tick off, and dose history. */
export function MedicationsPanel({ petId }: { petId: string }) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const canCreate = useCan('create', 'medication');
  const canLog = useCan('create', 'medicationDose');
  const canDelete = useCanDelete('medication');
  const today = useToday();
  const meds = useHealthList('medication', petId);
  const doses = useHealthList('medicationDose', petId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState(emptyScheduleForm(today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scheduleError, setScheduleError] = useState<string | undefined>();

  const submit = async () => {
    const dose = values.dose ? Number(values.dose) : undefined;
    try {
      await health.add('medication', householdId, {
        petId,
        name: values.name?.trim(),
        dose,
        doseUnit: values.doseUnit,
        note: values.note,
        schedule: scheduleFromForm(schedule, tz),
      });
      setValues({});
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

  const log = (med: StoredRecord, slot: DoseSlot, skipped: boolean) =>
    void health.logDose(householdId, med, slot.occurrenceAt, skipped, new Date());

  const rows = meds.data ?? [];
  return (
    <section className="flex flex-col gap-4" aria-labelledby="med-title">
      <h2 id="med-title" className="text-xl font-semibold">
        {t('med.title')}
      </h2>
      {canCreate ? (
        <RecordForm
          title={t('med.add')}
          fields={FIELDS}
          values={values}
          errors={errors}
          onChange={setValues}
          onSubmit={() => void submit()}
          submitLabel={t('med.add')}
        >
          <ScheduleFields values={schedule} onChange={setSchedule} error={scheduleError} />
        </RecordForm>
      ) : null}
      {rows.length === 0 ? <Banner>{t('med.empty')}</Banner> : null}
      <ul className="flex flex-col gap-3">
        {rows.map((m) => {
          const name = String(m.data.name);
          const slots = courseEnded(m, today) ? [] : doseSlots(m, doses.data ?? [], new Date());
          return (
            <li
              key={m.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <strong>{name}</strong>
                  {m.data.dose ? (
                    <span className="text-sm">
                      {' '}
                      · {String(m.data.dose)} {String(m.data.doseUnit ?? '')}
                    </span>
                  ) : null}
                  {courseEnded(m, today) ? (
                    <span className="ml-2 rounded border border-line px-1 text-sm">
                      {t('med.ended')}
                    </span>
                  ) : null}
                </div>
                {canDelete(m.createdBy) ? (
                  <Button
                    variant="secondary"
                    aria-label={t('form.deleteLabel', { name })}
                    onClick={() => void health.remove('medication', m.id)}
                  >
                    {t('form.delete')}
                  </Button>
                ) : null}
              </div>
              <ul className="flex flex-col gap-1" aria-label={t('med.doses', { name })}>
                {slots.map((slot) => {
                  const when = new Date(slot.occurrenceAt).toLocaleString(undefined, {
                    timeZone: tz,
                    dateStyle: 'short',
                    timeStyle: 'short',
                  });
                  return (
                    <li key={slot.occurrenceAt} className="flex flex-wrap items-center gap-2">
                      <span>{when}</span>
                      {slot.dose ? (
                        <span>{slot.dose.data.skipped ? t('med.skipped') : t('med.given')}</span>
                      ) : canLog ? (
                        <>
                          <Button
                            aria-label={t('med.giveLabel', { name, when })}
                            onClick={() => log(m, slot, false)}
                          >
                            {t('med.give')}
                          </Button>
                          <Button
                            variant="secondary"
                            aria-label={t('med.skipLabel', { name, when })}
                            onClick={() => log(m, slot, true)}
                          >
                            {t('med.skip')}
                          </Button>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
