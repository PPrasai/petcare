import { useState } from 'react';
import { courseEnded, doseSlots } from '../../application/health-logic';
import type { DoseSlot } from '../../application/health-logic';
import { InvalidInput } from '../../application/pet-service';
import type { StoredRecord } from '../../application/ports/record-store';
import { emptyScheduleForm, scheduleFromForm } from '../../application/schedule-form';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Button, Card, EmptyState, Icon, Line, Pill, SectionHeader } from '../../ui';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { errorsFor, useHealthList, useToday } from './hooks';
import { RecordForm, RecordSheet } from './RecordForm';
import type { FieldSpec } from './RecordForm';
import { ScheduleFields } from './ScheduleFields';

const UNITS = ['mg', 'ml', 'tablet', 'capsule', 'drop', 'puff', 'application', 'other'] as const;

const FIELDS: FieldSpec[] = [
  { name: 'name', label: t('med.name') },
  { name: 'dose', label: t('med.dose'), type: 'number', half: true },
  {
    name: 'doseUnit',
    label: t('med.doseUnit'),
    type: 'select',
    half: true,
    options: [{ value: '', label: '' }, ...UNITS.map((u) => ({ value: u, label: u }))],
  },
  { name: 'note', label: t('med.note') },
];

function AddMedication({ petId, onClose }: { petId: string; onClose: () => void }) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const show = useToastStore((s) => s.show);
  const today = useToday();
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
      show(t('form.added', { name: values.name?.trim() ?? '' }));
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      const field = e.path.split('.')[0] ?? '';
      setScheduleError(field === 'schedule' ? t('form.invalid') : undefined);
      setErrors(field === 'schedule' ? {} : errorsFor(e.path, t('form.invalid')));
    }
  };

  return (
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
  );
}

/** Medications of one pet: courses, a dose list to tick off, and an add sheet. */
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
  const [adding, setAdding] = useState(false);

  const log = (med: StoredRecord, slot: DoseSlot, skipped: boolean) =>
    void health.logDose(householdId, med, slot.occurrenceAt, skipped, new Date());

  const rows = meds.data ?? [];
  return (
    <Card>
      <SectionHeader
        title={t('med.title')}
        {...(canCreate
          ? {
              action: {
                label: t('ui.add'),
                ariaLabel: t('med.addLabel'),
                onClick: () => setAdding(true),
              },
            }
          : {})}
      />
      {rows.length === 0 ? <EmptyState>{t('empty.medications')}</EmptyState> : null}
      {rows.length > 0 ? (
        <ul className="rows" aria-label={t('med.title')}>
          {rows.map((m) => {
            const name = String(m.data.name);
            const ended = courseEnded(m, today);
            const slots = ended ? [] : doseSlots(m, doses.data ?? [], new Date());
            const dose = m.data.dose
              ? `${String(m.data.dose)} ${String(m.data.doseUnit ?? '')}`.trim()
              : '';
            return (
              <li key={m.id}>
                <Line
                  as="div"
                  title={name}
                  {...(dose ? { sub: dose } : {})}
                  aside={ended ? <Pill tone="ok">{t('med.finished')}</Pill> : null}
                  actions={
                    canDelete(m.createdBy) ? (
                      <Button
                        variant="secondary"
                        aria-label={t('form.deleteLabel', { name })}
                        onClick={() => void health.remove('medication', m.id)}
                      >
                        {t('form.delete')}
                      </Button>
                    ) : null
                  }
                />
                {slots.length > 0 ? (
                  <ul aria-label={t('med.doses', { name })}>
                    {slots.map((slot) => {
                      const when = new Date(slot.occurrenceAt).toLocaleString(undefined, {
                        timeZone: tz,
                        dateStyle: 'short',
                        timeStyle: 'short',
                      });
                      return (
                        <li key={slot.occurrenceAt} className={`task ${slot.dose ? 'done' : ''}`}>
                          {!slot.dose && canLog ? (
                            <button
                              type="button"
                              className="chk"
                              aria-label={t('med.giveLabel', { name, when })}
                              onClick={() => log(m, slot, false)}
                            >
                              <Icon name="check" />
                            </button>
                          ) : null}
                          <div className="tt">
                            <b>{when}</b>
                            {slot.dose ? (
                              <span>
                                {slot.dose.data.skipped ? t('med.skipped') : t('med.given')}
                              </span>
                            ) : null}
                          </div>
                          {!slot.dose && canLog ? (
                            <button
                              type="button"
                              className="linkbtn"
                              aria-label={t('med.skipLabel', { name, when })}
                              onClick={() => log(m, slot, true)}
                            >
                              {t('med.skip')}
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <RecordSheet open={adding} title={t('med.add')} onClose={() => setAdding(false)}>
        <AddMedication petId={petId} onClose={() => setAdding(false)} />
      </RecordSheet>
    </Card>
  );
}
