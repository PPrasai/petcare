import { SCHEDULE_KINDS } from '../../application/schedule-form';
import type { ScheduleFormValues } from '../../application/schedule-form';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { Button, SelectField, TextField } from '../../ui';

/** The times the form holds, as the separate values of its time inputs. */
const timeList = (times: string): string[] => times.split(',').map((s) => s.trim());
const DEFAULT_TIME = '08:00';

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
  const times = timeList(values.times);
  const setTimes = (next: string[]) => set({ times: next.join(', ') });
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
      <div className="fstack">
        {times.map((time, i) => (
          <div className="row2" key={i}>
            <TextField
              label={t(times.length > 1 ? 'schedule.timeN' : 'schedule.time', { n: String(i + 1) })}
              type="time"
              value={time}
              onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {times.length > 1 ? (
              <Button
                variant="secondary"
                aria-label={t('schedule.removeTime', { n: String(i + 1) })}
                onClick={() => setTimes(times.filter((_, j) => j !== i))}
              >
                ×
              </Button>
            ) : null}
          </div>
        ))}
        <Button variant="secondary" onClick={() => setTimes([...times, DEFAULT_TIME])}>
          {t('schedule.addTime')}
        </Button>
      </div>
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
