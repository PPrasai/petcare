import { scheduleSchema } from '@petcare/domain';
import type { Schedule } from '@petcare/domain';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { InvalidInput } from '../../application/pet-service';
import type { StoredRecord } from '../../application/ports/record-store';
import {
  REMINDER_TYPES,
  REPEATS,
  audienceOf,
  emptyReminderForm,
  reminderSchedule,
  reminderToForm,
} from '../../application/reminder-form';
import type { ReminderCategory, ReminderFormValues, Repeat } from '../../application/reminder-form';
import type { MessageKey } from '../../i18n/en';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Button, Chip, Sheet, SheetHead, SelectField, TextField } from '../../ui';
import { useToday } from '../health/hooks';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { useFocusInvalid } from '../shared/use-focus-invalid';
import { useMemberName } from './audience';
import { repeatText } from './repeat-text';

const hasDate = (repeat: Repeat): boolean =>
  repeat === 'once' || repeat === 'monthly' || repeat === 'yearly';

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** What the sheet edits: a new reminder, a stored reminder, or a stored (legacy) care routine. */
export type ReminderTarget =
  | { mode: 'new'; petId: string; petName: string }
  | { mode: 'edit'; type: 'reminder' | 'careRoutine'; record: StoredRecord };

const headingOf = (target: ReminderTarget): MessageKey =>
  target.mode === 'new'
    ? 'reminder.sheet.new'
    : target.type === 'reminder'
      ? 'reminder.sheet.edit'
      : 'routine.sheet.edit';

function ReminderForm({ target, onClose }: { target: ReminderTarget; onClose: () => void }) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const me = useSessionStore((s) => s.user?.id ?? '');
  const show = useToastStore((s) => s.show);
  const today = useToday();
  const type = target.mode === 'new' ? 'reminder' : target.type;
  const stored =
    target.mode === 'edit' ? scheduleSchema.safeParse(target.record.data.schedule) : null;
  const base: Schedule | undefined = stored?.success ? stored.data : undefined;
  const canDelete = useCanDelete(type);
  const canUpdate = useCan('update', type);
  const storedAudience =
    target.mode === 'edit' ? audienceOf(target.record.data.audienceUserId, me) : 'everyone';
  const [values, setValues] = useState<ReminderFormValues>(() =>
    target.mode === 'edit' && base
      ? reminderToForm(String(target.record.data.title ?? ''), base, storedAudience)
      : emptyReminderForm(today, t('reminder.type.walk')),
  );
  const otherId =
    target.mode === 'edit' && storedAudience === 'other'
      ? String(target.record.data.audienceUserId)
      : null;
  const otherName = useMemberName(otherId);
  const hasAudience = type === 'reminder';
  const [errors, setErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  useFocusInvalid(form, errors);
  const set = (patch: Partial<ReminderFormValues>) => setValues((v) => ({ ...v, ...patch }));
  // A type chip sets the category and, as in the mock, a matching name and time.
  const pickType = (id: ReminderCategory, time: string) =>
    set({
      category: id,
      title: id === 'other' ? '' : t(`reminder.type.${id}` as MessageKey),
      time,
    });
  const toggleDay = (day: number) =>
    set({
      days: values.days.includes(day)
        ? values.days.filter((d) => d !== day)
        : [...values.days, day],
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const title = values.title.trim();
    const next: Record<string, string> = {};
    if (title === '') next.title = t('reminder.nameRequired');
    if (values.repeat === 'weekly' && values.days.length === 0) {
      next.days = t('reminder.daysRequired');
    }
    if (hasDate(values.repeat) && values.date === '') {
      next.date = t('form.invalid');
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const schedule = reminderSchedule(values, prefs.timeZone, today, base, new Date());
    try {
      if (target.mode === 'new') {
        await health.add('reminder', householdId, {
          petId: target.petId,
          title,
          active: true,
          schedule,
          category: values.category,
          // Null is left out on create: no audience means everyone.
          audienceUserId: values.audience === 'me' ? me : null,
        });
        show(
          t('reminder.created', {
            pet: target.petName,
            title,
            when: repeatText(schedule as Schedule, prefs),
          }),
        );
      } else {
        const audience =
          hasAudience && values.audience !== storedAudience && values.audience !== 'other'
            ? { audienceUserId: values.audience === 'me' ? me : null }
            : {};
        await health.update(type, target.record.id, { title, schedule, ...audience });
        show(t('reminder.saved', { title }));
      }
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors({ form: t('form.invalid') });
    }
  };

  const remove = async () => {
    if (target.mode !== 'edit') return;
    await health.remove(type, target.record.id);
    show(t('reminder.deleted', { title: String(target.record.data.title ?? '') }));
    onClose();
  };

  const repeats: Repeat[] = base?.kind === 'everyNDays' ? [...REPEATS, base.kind] : [...REPEATS];
  const editable = target.mode === 'new' || canUpdate;

  return (
    <form ref={form} aria-label={t(headingOf(target))} onSubmit={(e) => void submit(e)} noValidate>
      {target.mode === 'new' ? (
        <div className="tags" role="group" aria-label={t('reminder.type.label')}>
          {REMINDER_TYPES.map((r) => (
            <Chip
              key={r.id}
              pressed={values.category === r.id}
              onClick={() => pickType(r.id, r.time)}
            >
              {t(`reminder.type.${r.id}` as MessageKey)}
            </Chip>
          ))}
        </div>
      ) : null}
      <TextField
        label={t('reminder.name')}
        autoComplete="off"
        placeholder={t('reminder.namePlaceholder')}
        value={values.title}
        error={errors.title}
        onChange={(e) => set({ title: e.target.value })}
      />
      <div className="fld">
        <span className="label">{t('reminder.repeat')}</span>
        <div className="tags" role="group" aria-label={t('reminder.repeat')}>
          {repeats.map((r) => (
            <Chip key={r} pressed={values.repeat === r} onClick={() => set({ repeat: r })}>
              {t(`reminder.repeat.${r}` as MessageKey)}
            </Chip>
          ))}
        </div>
      </div>
      {values.repeat === 'weekly' ? (
        <div className="fld">
          <div className="tags days" role="group" aria-label={t('reminder.days')}>
            {DAYS.map((d) => (
              <Chip key={d} pressed={values.days.includes(d)} onClick={() => toggleDay(d)}>
                {t(`schedule.day.${d}` as MessageKey)}
              </Chip>
            ))}
          </div>
          {errors.days ? (
            <p role="alert" className="err">
              {errors.days}
            </p>
          ) : null}
        </div>
      ) : null}
      {hasDate(values.repeat) ? (
        <TextField
          label={t(values.repeat === 'once' ? 'reminder.date' : 'reminder.starting')}
          type="date"
          value={values.date}
          error={errors.date}
          onChange={(e) => set({ date: e.target.value })}
        />
      ) : null}
      {values.repeat === 'everyNDays' ? (
        <TextField
          label={t('schedule.everyN')}
          type="number"
          value={values.everyN}
          onChange={(e) => set({ everyN: e.target.value })}
        />
      ) : null}
      <div className="row2">
        <TextField
          label={t('reminder.time')}
          type="time"
          value={values.time}
          onChange={(e) => e.target.value && set({ time: e.target.value })}
        />
        {hasAudience ? (
          <SelectField
            label={t('reminder.who')}
            value={values.audience}
            options={[
              { value: 'everyone', label: t('reminder.who.everyone') },
              { value: 'me', label: t('reminder.who.me') },
              ...(storedAudience === 'other'
                ? [
                    {
                      value: 'other',
                      label: t('reminder.who.only', {
                        name: otherName ?? t('reminder.who.otherMember'),
                      }),
                    },
                  ]
                : []),
            ]}
            onChange={(e) => set({ audience: e.target.value as ReminderFormValues['audience'] })}
          />
        ) : null}
      </div>
      {values.repeat === 'daily' ? (
        <TextField
          label={t('reminder.time2')}
          type="time"
          value={values.time2}
          onChange={(e) => set({ time2: e.target.value })}
        />
      ) : null}
      {errors.form ? (
        <p role="alert" className="err">
          {errors.form}
        </p>
      ) : null}
      {editable ? (
        <Button type="submit">
          {t(target.mode === 'new' ? 'reminder.save' : 'reminder.saveChanges')}
        </Button>
      ) : null}
      {target.mode === 'edit' && canDelete(target.record.createdBy) ? (
        <Button variant="secondary" onClick={() => void remove()}>
          {t(type === 'reminder' ? 'reminder.delete' : 'routine.delete')}
        </Button>
      ) : null}
    </form>
  );
}

/** Create, edit or delete one reminder; edit a legacy care routine (CAP-07, CAP-10). */
export function ReminderSheet({
  target,
  onClose,
}: {
  /** Null while the sheet is closed. */
  target: ReminderTarget | null;
  onClose: () => void;
}) {
  const title = target ? t(headingOf(target)) : '';
  return (
    <Sheet open={target !== null} label={title} onClose={onClose}>
      <SheetHead title={title} onClose={onClose} />
      {target ? <ReminderForm target={target} onClose={onClose} /> : null}
    </Sheet>
  );
}
