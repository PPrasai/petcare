import { SCHEDULE_KINDS } from '../../application/schedule-form';
import type { ScheduleFormValues } from '../../application/schedule-form';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { SelectField, TextField } from '../../ui';

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

interface Props {
  values: ScheduleFormValues;
  onChange: (values: ScheduleFormValues) => void;
  /** Shown when the schedule is refused. */
  error?: string | undefined;
}

/** The schedule editor shared by medications and (later) care routines and reminders. */
export function ScheduleFields({ values, onChange, error }: Props) {
  const set = (patch: Partial<ScheduleFormValues>) => onChange({ ...values, ...patch });
  const toggleDay = (day: number) =>
    set({
      daysOfWeek: values.daysOfWeek.includes(day)
        ? values.daysOfWeek.filter((d) => d !== day)
        : [...values.daysOfWeek, day],
    });
  return (
    <fieldset className="sched">
      <legend className="label">{t('schedule.title')}</legend>
      <SelectField
        label={t('schedule.kind')}
        value={values.kind}
        options={SCHEDULE_KINDS.map((k) => ({
          value: k,
          label: t(`schedule.kind.${k}` as MessageKey),
        }))}
        onChange={(e) => set({ kind: e.target.value as ScheduleFormValues['kind'] })}
      />
      {values.kind === 'weekly' ? (
        <fieldset className="fld">
          <legend className="label">{t('schedule.days')}</legend>
          <div className="tags">
            {DAYS.map((d) => (
              <label key={d} className="check">
                <input
                  type="checkbox"
                  checked={values.daysOfWeek.includes(d)}
                  onChange={() => toggleDay(d)}
                />
                {t(`schedule.day.${d}` as MessageKey)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {values.kind === 'monthly' ? (
        <TextField
          label={t('schedule.dayOfMonth')}
          type="number"
          value={values.dayOfMonth}
          onChange={(e) => set({ dayOfMonth: e.target.value })}
        />
      ) : null}
      {values.kind === 'everyNDays' ? (
        <TextField
          label={t('schedule.everyN')}
          type="number"
          value={values.everyN}
          onChange={(e) => set({ everyN: e.target.value })}
        />
      ) : null}
      <TextField
        label={t('schedule.times')}
        placeholder="08:00, 20:00"
        value={values.times}
        onChange={(e) => set({ times: e.target.value })}
      />
      <div className="row2">
        <TextField
          label={t('schedule.startOn')}
          type="date"
          value={values.startOn}
          onChange={(e) => set({ startOn: e.target.value })}
        />
        <TextField
          label={t('schedule.endOn')}
          type="date"
          value={values.endOn}
          onChange={(e) => set({ endOn: e.target.value })}
        />
      </div>
      {error ? (
        <p role="alert" className="err">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
