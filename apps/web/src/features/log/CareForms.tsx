import { instantToLocalDate, QUANTITY_UNITS } from '@petcare/domain';
import type { QuantityUnit } from '@petcare/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  AGAIN_DAYS,
  GROOMING_TASKS,
  PRESETS_SHOWN,
  WALK_MINUTES,
} from '../../application/log-service';
import type { GroomingTask } from '../../application/log-service';
import { addDays, courseEnded } from '../../application/health-logic';
import { InvalidInput } from '../../application/pet-service';
import type { StoredRecord } from '../../application/ports/record-store';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Button, Chip, SelectField, TextField } from '../../ui';
import { useHealthList, useToday } from '../health/hooks';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { amountText, rememberUnit, rememberedUnit, unitName } from './quantity';

/** Everything a form needs from the sheet around it. */
export interface CareFormProps {
  petId: string;
  petName: string;
  /** Closes the sheet with a toast; `undo` adds the Undo button. */
  done: (message: string, undo?: () => void) => void;
}

const NONE = 'none';

/** "Remind me again (optional)": nothing, or a once reminder N days on (AS-002 4.2). */
function AgainField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <SelectField
      label={t('log.again.label')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[
        { value: NONE, label: t('log.again.none') },
        ...AGAIN_DAYS.map((d) => ({ value: String(d), label: t(`log.again.${d}`) })),
      ]}
    />
  );
}

const againDays = (value: string): number | null => (value === NONE ? null : Number(value));

/** " Reminder set for 16 Nov." (or nothing) for the toast. */
function againNote(days: number | null, tz: string, now: Date): string {
  if (days === null) return '';
  const date = addDays(instantToLocalDate(now.getTime(), tz), days);
  return t('log.again.set', {
    date: new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
    }),
  });
}

export function MealForm({ petId, petName, done }: CareFormProps) {
  const { log } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const userId = useSessionStore((s) => s.user?.id ?? '');
  const [food, setFood] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<QuantityUnit>(() => rememberedUnit(userId));
  const [time, setTime] = useState('');
  const [savePreset, setSavePreset] = useState(true);
  const [error, setError] = useState<{ field: 'food' | 'quantity'; message: string } | null>(null);
  const presets = useQuery({
    queryKey: ['mealPreset', householdId, { petId }],
    queryFn: () => log.presets(householdId, petId),
    enabled: householdId !== '',
  });
  const shown = (presets.data ?? []).slice(0, PRESETS_SHOWN);

  const finish = (message: string, written: StoredRecord[]) =>
    done(message, () => void log.undo(written));

  const tap = async (preset: StoredRecord) => {
    const written = await log.mealFromPreset(householdId, preset, new Date());
    const amount = amountText(Number(preset.data.quantity), String(preset.data.quantityUnit));
    finish(
      t('log.meal.presetToast', { food: String(preset.data.foodName), amount, name: petName }),
      written,
    );
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const written = await log.meal(
        householdId,
        { petId, food, quantity, unit, time, savePreset },
        prefs,
        new Date(),
      );
      rememberUnit(userId, unit);
      finish(t('log.meal.toast', { name: petName }), written);
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setError(
        e.path === 'quantity'
          ? { field: 'quantity', message: t('log.meal.quantityError') }
          : { field: 'food', message: t('log.meal.error', { name: petName }) },
      );
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="stack" style={{ gap: 14 }}>
      {shown.length > 0 ? (
        <>
          <div className="fld">
            <span className="label">{t('log.meal.quick')}</span>
            <div className="presets">
              {shown.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="preset"
                  data-testid="meal-preset"
                  onClick={() => void tap(p)}
                >
                  <b>{String(p.data.foodName)}</b>
                  <span>{amountText(Number(p.data.quantity), String(p.data.quantityUnit))}</span>
                </button>
              ))}
            </div>
          </div>
          <span className="label">{t('log.meal.other')}</span>
        </>
      ) : null}
      <TextField
        label={t('log.meal.food')}
        autoComplete="off"
        placeholder={t('log.meal.foodPlaceholder', { name: petName })}
        value={food}
        onChange={(e) => setFood(e.target.value)}
        error={error?.field === 'food' ? error.message : undefined}
      />
      <div className="row2">
        <TextField
          label={t('log.meal.quantity')}
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          placeholder={t('log.meal.quantityPlaceholder')}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={error?.field === 'quantity' ? error.message : undefined}
        />
        <SelectField
          label={t('log.meal.unit')}
          value={unit}
          onChange={(e) => setUnit(e.target.value as QuantityUnit)}
          options={QUANTITY_UNITS.map((u) => ({ value: u, label: unitName(u, 2) }))}
        />
      </div>
      <TextField
        label={t('log.time')}
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
      />
      <Chip
        pressed={savePreset}
        onClick={() => setSavePreset(!savePreset)}
        style={{ alignSelf: 'flex-start' }}
      >
        {t('log.meal.savePreset')}
      </Chip>
      <Button type="submit">{t('log.meal.save')}</Button>
    </form>
  );
}

export function WalkForm({ petId, petName, done }: CareFormProps) {
  const { log } = useServices();
  const householdId = useHouseholdId();
  const save = async (minutes: number) => {
    const written = await log.walk(householdId, petId, minutes, new Date());
    done(t('log.walk.toast', { count: minutes, name: petName }), () => void log.undo(written));
  };
  return (
    <>
      <p className="muted">{t('log.walk.help')}</p>
      <div className="tags">
        {WALK_MINUTES.map((m) => (
          <Chip
            key={m}
            pressed={false}
            style={{ fontSize: 16, padding: '12px 20px' }}
            onClick={() => void save(m)}
          >
            {t('log.walk.minutes', { count: m })}
          </Chip>
        ))}
      </div>
    </>
  );
}

export function GroomingForm({ petId, petName, done }: CareFormProps) {
  const { log } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const [tasks, setTasks] = useState<GroomingTask[]>([]);
  const [note, setNote] = useState('');
  const [again, setAgain] = useState(NONE);
  const [error, setError] = useState('');

  const toggle = (task: GroomingTask) =>
    setTasks((now) => (now.includes(task) ? now.filter((x) => x !== task) : [...now, task]));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const now = new Date();
    try {
      const written = await log.grooming(
        householdId,
        {
          petId,
          tasks,
          note,
          againDays: againDays(again),
          reminderTitle: tasks.map((x) => t(`log.groom.task.${x}`)).join(', '),
        },
        prefs,
        now,
      );
      done(
        t('log.groom.toast', {
          name: petName,
          extra: againNote(againDays(again), prefs.timeZone, now),
        }),
        () => void log.undo(written),
      );
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setError(t('log.groom.error'));
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="stack" style={{ gap: 14 }}>
      <p className="muted">{t('log.groom.help')}</p>
      <div className="tags" role="group" aria-label={t('log.groom.group')}>
        {GROOMING_TASKS.map((task) => (
          <Chip key={task} pressed={tasks.includes(task)} onClick={() => toggle(task)}>
            {t(`log.groom.task.${task}`)}
          </Chip>
        ))}
      </div>
      <TextField
        label={t('log.groom.note')}
        placeholder={t('log.groom.notePlaceholder')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <AgainField value={again} onChange={setAgain} />
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit">{t('log.groom.save')}</Button>
    </form>
  );
}

export function MedicationForm({ petId, petName, done }: CareFormProps) {
  const { log } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const userId = useSessionStore((s) => s.user?.id ?? '');
  const [name, setName] = useState('');
  const [medicationId, setMedicationId] = useState<string | undefined>();
  const [route, setRoute] = useState<'oral' | 'topical'>('oral');
  const [dose, setDose] = useState('');
  const [time, setTime] = useState('');
  const [again, setAgain] = useState(NONE);
  const [error, setError] = useState('');
  const meds = useHealthList('medication', petId);
  const today = useToday();
  const current = (meds.data ?? []).filter((m) => !courseEnded(m, today));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const now = new Date();
    const days = againDays(again);
    try {
      const { records, matched } = await log.medication(
        householdId,
        {
          petId,
          name,
          ...(medicationId ? { medicationId } : {}),
          route,
          dose,
          time,
          againDays: days,
          reminderTitle: name.trim(),
        },
        { userId, prefs },
        now,
      );
      const extra = againNote(days, prefs.timeZone, now);
      done(
        matched
          ? t('log.med.toastDone', { name: name.trim(), task: matched.title, extra })
          : t('log.med.toast', { name: name.trim(), pet: petName, extra }),
        () => void log.undo(records),
      );
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setError(t('log.med.error'));
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="stack" style={{ gap: 14 }}>
      <TextField
        label={t('log.med.name')}
        autoComplete="off"
        placeholder={t('log.med.placeholder')}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setMedicationId(undefined);
        }}
        error={error || undefined}
      />
      {current.length > 0 ? (
        <div className="tags" role="group" aria-label={t('log.med.current')}>
          {current.map((m) => (
            <Chip
              key={m.id}
              pressed={medicationId === m.id}
              onClick={() => {
                setName(String(m.data.name));
                setMedicationId(m.id);
              }}
            >
              {String(m.data.name)}
            </Chip>
          ))}
        </div>
      ) : null}
      <div className="tags" role="group" aria-label={t('log.med.route')}>
        {(['oral', 'topical'] as const).map((r) => (
          <Chip key={r} pressed={route === r} onClick={() => setRoute(r)}>
            {t(`log.med.route.${r}`)}
          </Chip>
        ))}
      </div>
      <div className="row2">
        <TextField
          label={t('log.med.dose')}
          placeholder={t('log.med.dosePlaceholder')}
          value={dose}
          onChange={(e) => setDose(e.target.value)}
        />
        <TextField
          label={t('log.time')}
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>
      <AgainField value={again} onChange={setAgain} />
      <Button type="submit">{t('log.med.save')}</Button>
    </form>
  );
}
