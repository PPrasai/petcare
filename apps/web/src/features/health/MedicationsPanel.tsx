import { useState } from 'react';
import { scheduleSchema } from '@petcare/domain';
import { courseEnded, doseSlots } from '../../application/health-logic';
import type { DoseSlot } from '../../application/health-logic';
import { InvalidInput } from '../../application/pet-service';
import type { StoredRecord } from '../../application/ports/record-store';
import {
  emptyScheduleForm,
  scheduleFromForm,
  scheduleToForm,
} from '../../application/schedule-form';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Button, Card, EmptyState, Icon, Line, Pill, SectionHeader } from '../../ui';
import { EditButton } from '../shared/EditButton';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useRemoval } from '../shared/removal';
import { useSaveFailure } from '../shared/save-failure';
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

const text = (v: unknown): string =>
  typeof v === 'number' || typeof v === 'string' ? String(v) : '';

/** The medication form: adds one, or with `record` changes that one. */
function MedicationForm({
  petId,
  record,
  onClose,
}: {
  petId: string;
  record?: StoredRecord;
  onClose: () => void;
}) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const show = useToastStore((s) => s.show);
  const today = useToday();
  const stored = record ? scheduleSchema.safeParse(record.data.schedule) : null;
  const [values, setValues] = useState<Record<string, string>>(
    record ? Object.fromEntries(FIELDS.map((f) => [f.name, text(record.data[f.name])])) : {},
  );
  const [schedule, setSchedule] = useState(
    stored?.success ? scheduleToForm(stored.data) : emptyScheduleForm(today),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scheduleError, setScheduleError] = useState<string | undefined>();

  const failure = useSaveFailure();
  const submit = async () => {
    const dose = values.dose ? Number(values.dose) : undefined;
    failure.clear();
    try {
      const input = {
        name: values.name?.trim(),
        dose,
        doseUnit: values.doseUnit,
        note: values.note,
        schedule: scheduleFromForm(schedule, stored?.success ? stored.data.tz : tz),
      };
      if (record) {
        await health.edit('medication', record.id, input);
        show(t('form.saved', { name: values.name?.trim() ?? '' }));
      } else {
        await health.add('medication', householdId, { petId, ...input });
        show(t('form.added', { name: values.name?.trim() ?? '' }));
      }
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) {
        failure.fail(e);
        return;
      }
      const field = e.path.split('.')[0] ?? '';
      setScheduleError(field === 'schedule' ? t('form.invalid') : undefined);
      setErrors(field === 'schedule' ? {} : errorsFor(e.path, t('form.invalid')));
    }
  };

  return (
    <RecordForm
      title={record ? t('med.edit') : t('med.add')}
      fields={FIELDS}
      values={values}
      errors={errors}
      onChange={setValues}
      onSubmit={() => void submit()}
      submitLabel={record ? t('form.saveChanges') : t('med.add')}
    >
      <ScheduleFields values={schedule} onChange={setSchedule} error={scheduleError} />
      {failure.view}
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
  const removeRecord = useRemoval();
  const today = useToday();
  const meds = useHealthList('medication', petId);
  const doses = useHealthList('medicationDose', petId);
  const [sheet, setSheet] = useState<{ record?: StoredRecord } | null>(null);
  const canEdit = useCan('update', 'medication');

  const log = (med: StoredRecord, slot: DoseSlot, skipped: boolean) =>
    void health.logDose(householdId, med, slot.occurrenceAt, skipped, new Date());

  const rows = meds.data ?? [];
  return (
    <Card data-area="meds">
      <SectionHeader
        title={t('med.title')}
        {...(canCreate
          ? {
              action: {
                label: t('ui.add'),
                ariaLabel: t('med.addLabel'),
                onClick: () => setSheet({}),
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
                    <>
                      {canEdit ? (
                        <EditButton name={name} onClick={() => setSheet({ record: m })} />
                      ) : null}
                      {canDelete(m.createdBy) ? (
                        <Button
                          variant="secondary"
                          aria-label={t('form.deleteLabel', { name })}
                          onClick={() => void removeRecord(m, name)}
                        >
                          {t('form.delete')}
                        </Button>
                      ) : null}
                    </>
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
      <RecordSheet
        open={sheet !== null}
        title={sheet?.record ? t('med.edit') : t('med.add')}
        onClose={() => setSheet(null)}
      >
        <MedicationForm
          petId={petId}
          {...(sheet?.record ? { record: sheet.record } : {})}
          onClose={() => setSheet(null)}
        />
      </RecordSheet>
    </Card>
  );
}
