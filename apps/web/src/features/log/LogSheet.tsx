import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { LOG_EXPENSE_CATEGORIES, LOG_EXPENSE_MORE } from '../../application/log-service';
import type { LogKind } from '../../application/log-service';
import { InvalidInput } from '../../application/pet-service';
import { PhotoUnusable } from '../../application/ports/image-reducer';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatMeasurement, toDisplay, toStored, unitLabel } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Button, Chip, Icon, Sheet, Stepper, TextField } from '../../ui';
import type { IconName } from '../../ui';
import { isAllowedFile } from '../files/FilePicker';
import { PetAvatar } from '../shared/PetAvatar';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { GroomingForm, MealForm, MedicationForm, WalkForm } from './CareForms';
import { useLogSheetStore } from './log-sheet';
import type { LogSheetRequest } from './log-sheet';

const KINDS: { kind: LogKind; icon: IconName }[] = [
  { kind: 'meal', icon: 'meal' },
  { kind: 'walk', icon: 'walk' },
  { kind: 'medication', icon: 'pill' },
  { kind: 'grooming', icon: 'groom' },
  { kind: 'weight', icon: 'scale' },
  { kind: 'note', icon: 'note' },
  { kind: 'expense', icon: 'wallet' },
  { kind: 'vet', icon: 'vet' },
  { kind: 'photo', icon: 'camera' },
];

const QUICK_NOTES = ['limping', 'notEating', 'vomiting', 'itching', 'lowEnergy'] as const;
const STEP = 0.1;
const DEFAULT_KG = 10;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Everything a form needs from the sheet around it. */
interface FormProps {
  petId: string;
  petName: string;
  done: (message: string, undo?: () => void) => void;
}

function WeightForm({ petId, petName, done }: FormProps) {
  const { log, measurements } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const [value, setValue] = useState<number | null>(null);
  const last = useQuery({
    queryKey: ['measurement', householdId, { petId }],
    queryFn: () => measurements.list(householdId, petId),
    enabled: householdId !== '',
  });
  const latest = (last.data ?? []).filter((m) => m.data.kind === 'weight').at(-1);
  const shown =
    value ?? round1(toDisplay('weight', latest ? Number(latest.data.value) : DEFAULT_KG, prefs));
  const unit = unitLabel('weight', prefs);

  const save = async () => {
    await log.weight(householdId, petId, shown, prefs, new Date());
    done(
      t('log.weight.toast', {
        name: petName,
        value: formatMeasurement('weight', toStored('weight', shown, prefs), prefs),
      }),
    );
  };

  return (
    <>
      <Stepper
        label={t('log.kind.weight')}
        value={`${shown.toFixed(1)} ${unit}`}
        lowerLabel={t('log.weight.lower')}
        raiseLabel={t('log.weight.raise')}
        onLower={() => setValue(Math.max(STEP, round1(shown - STEP)))}
        onRaise={() => setValue(round1(shown + STEP))}
      />
      <Button onClick={() => void save()}>{t('log.weight.save')}</Button>
    </>
  );
}

function NoteForm({ petId, petName, done }: FormProps) {
  const { log } = useServices();
  const householdId = useHouseholdId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const id = useId();

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await log.note(householdId, petId, text, new Date());
      done(t('log.note.toast', { name: petName }));
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setError(t('log.note.error'));
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="stack" style={{ gap: 14 }}>
      <div className="tags" role="group" aria-label={t('log.note.quickLabel')}>
        {QUICK_NOTES.map((q) => (
          <Chip
            key={q}
            pressed={false}
            onClick={() => {
              const phrase = t(`log.note.quick.${q}`);
              setText((current) => (current ? `${current}. ${phrase}` : phrase));
            }}
          >
            {t(`log.note.quick.${q}`)}
          </Chip>
        ))}
      </div>
      <div className="fld">
        <label className="label" htmlFor={id}>
          {t('log.note.label')}
        </label>
        <textarea
          id={id}
          rows={3}
          placeholder={t('log.note.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit">{t('log.note.save')}</Button>
    </form>
  );
}

function ExpenseForm({ petId, petName, done }: FormProps) {
  const { log } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(LOG_EXPENSE_CATEGORIES[0]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const moreId = useId();
  const showMore = more || (LOG_EXPENSE_MORE as readonly string[]).includes(category);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await log.expense(householdId, petId, amount, category, prefs, new Date());
      done(
        t('log.expense.toast', {
          amount: amount.trim(),
          category: t(`expenses.category.${category}` as MessageKey).toLowerCase(),
          name: petName,
        }),
      );
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setError(t('log.expense.error'));
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="stack" style={{ gap: 14 }}>
      <TextField
        label={t('log.expense.amount')}
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        placeholder={t('log.expense.placeholder')}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={error || undefined}
      />
      <div className="tags" role="group" aria-label={t('expenses.category')}>
        {LOG_EXPENSE_CATEGORIES.map((c) => (
          <Chip key={c} pressed={category === c} onClick={() => setCategory(c)}>
            {t(`expenses.category.${c}` as MessageKey)}
          </Chip>
        ))}
        <button
          type="button"
          className="chip"
          aria-expanded={showMore}
          aria-controls={moreId}
          onClick={() => setMore(!showMore)}
        >
          {t('log.expense.more')}
        </button>
      </div>
      {showMore ? (
        <div id={moreId} className="tags" role="group" aria-label={t('log.expense.moreLabel')}>
          {LOG_EXPENSE_MORE.map((c) => (
            <Chip key={c} pressed={category === c} onClick={() => setCategory(c)}>
              {t(`expenses.category.${c}` as MessageKey)}
            </Chip>
          ))}
        </div>
      ) : null}
      <Button type="submit">{t('log.expense.save')}</Button>
    </form>
  );
}

function VetForm({ petId, petName, done }: FormProps) {
  const { log } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const [reason, setReason] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState<{ field: 'reason' | 'cost'; message: string } | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await log.vetVisit(householdId, petId, reason, cost, prefs, new Date());
      done(t('log.vet.toast', { name: petName }));
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setError(
        e.path === 'cost'
          ? { field: 'cost', message: t('form.invalid') }
          : { field: 'reason', message: t('log.vet.error') },
      );
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="stack" style={{ gap: 14 }}>
      <TextField
        label={t('log.vet.reason')}
        autoComplete="off"
        placeholder={t('log.vet.reasonPlaceholder')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error?.field === 'reason' ? error.message : undefined}
      />
      <TextField
        label={t('log.vet.cost')}
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        placeholder={t('log.expense.placeholder')}
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        error={error?.field === 'cost' ? error.message : undefined}
      />
      <Button type="submit">{t('log.vet.save')}</Button>
    </form>
  );
}

function PhotoForm({ petId, petName, done }: FormProps) {
  const { log } = useServices();
  const householdId = useHouseholdId();
  const max = useSessionStore((s) => s.config?.maxFileBytes ?? 10_485_760);
  const [error, setError] = useState('');
  const id = useId();

  const pick = async (file: File | null) => {
    if (!file) return;
    if (!isAllowedFile(file) || !file.type.startsWith('image/')) {
      setError(t('files.badType'));
      return;
    }
    if (file.size > max) {
      setError(t('files.tooLarge', { mb: String(Math.round(max / 1_048_576)) }));
      return;
    }
    try {
      await log.photo(householdId, petId, file);
    } catch (e) {
      if (!(e instanceof PhotoUnusable)) throw e;
      setError(t('photo.unusable'));
      return;
    }
    done(t('log.photo.toast', { name: petName }));
  };

  return (
    <div className="fld">
      <label className="label" htmlFor={id}>
        {t('log.photo.choose')}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,.heic"
        onChange={(e) => {
          setError('');
          const file = e.target.files?.[0] ?? null;
          if (!file) return;
          void pick(file).finally(() => {
            e.target.value = '';
          });
        }}
      />
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** What is inside the sheet: the pet chips, the kind picker and the form of the chosen kind. */
function LogSheetBody({ request }: { request: LogSheetRequest }) {
  const close = useLogSheetStore((s) => s.close);
  const showToast = useToastStore((s) => s.show);
  const { pets } = useServices();
  const householdId = useHouseholdId();
  const [petId, setPetId] = useState(request.petId ?? '');
  const [kind, setKind] = useState<LogKind | null>(request.kind ?? null);

  const list = useQuery({
    queryKey: ['pet', householdId],
    queryFn: () => pets.list(householdId),
    enabled: householdId !== '',
  });
  const choices = (list.data ?? []).filter((p) => !p.data.archivedAt);

  const pet = choices.find((p) => p.id === petId) ?? choices[0];
  const petName = pet ? String(pet.data.name) : '';
  const finish = (message: string, undo?: () => void) => {
    showToast(message, undo ? { undo } : undefined);
    close();
  };

  return (
    <>
      <div className="sh-head">
        {kind ? (
          <button type="button" className="back" onClick={() => setKind(null)}>
            <Icon name="back" /> {t('log.back')}
          </button>
        ) : (
          <h2>{t('log.title')}</h2>
        )}
        <button type="button" className="xbtn" aria-label={t('log.close')} onClick={close}>
          <Icon name="x" />
        </button>
      </div>
      {kind && pet ? (
        <h2>{t('log.formTitle', { kind: t(`log.kind.${kind}`), name: petName })}</h2>
      ) : null}
      {choices.length === 0 && list.isSuccess ? <p className="empty">{t('pets.empty')}</p> : null}
      {choices.length > 0 ? (
        <div className="tags" role="group" aria-label={t('log.petGroup')}>
          {choices.map((p) => (
            <Chip
              key={p.id}
              className="pchip"
              pressed={p.id === pet?.id}
              onClick={() => setPetId(p.id)}
            >
              <PetAvatar pet={p} size={26} />
              {String(p.data.name)}
            </Chip>
          ))}
        </div>
      ) : null}
      {pet && kind === null ? (
        <div className="types">
          {KINDS.map(({ kind: k, icon }) => (
            <button key={k} type="button" onClick={() => setKind(k)}>
              <Icon name={icon} />
              {t(`log.kind.${k}`)}
            </button>
          ))}
        </div>
      ) : null}
      {pet && kind === 'meal' ? (
        <MealForm key={pet.id} petId={pet.id} petName={petName} done={finish} />
      ) : null}
      {pet && kind === 'walk' ? (
        <WalkForm key={pet.id} petId={pet.id} petName={petName} done={finish} />
      ) : null}
      {pet && kind === 'medication' ? (
        <MedicationForm key={pet.id} petId={pet.id} petName={petName} done={finish} />
      ) : null}
      {pet && kind === 'grooming' ? (
        <GroomingForm key={pet.id} petId={pet.id} petName={petName} done={finish} />
      ) : null}
      {pet && kind === 'weight' ? (
        <WeightForm key={pet.id} petId={pet.id} petName={petName} done={finish} />
      ) : null}
      {pet && kind === 'note' ? (
        <NoteForm key={pet.id} petId={pet.id} petName={petName} done={finish} />
      ) : null}
      {pet && kind === 'expense' ? (
        <ExpenseForm key={pet.id} petId={pet.id} petName={petName} done={finish} />
      ) : null}
      {pet && kind === 'vet' ? (
        <VetForm key={pet.id} petId={pet.id} petName={petName} done={finish} />
      ) : null}
      {pet && kind === 'photo' ? (
        <PhotoForm key={pet.id} petId={pet.id} petName={petName} done={finish} />
      ) : null}
    </>
  );
}

/**
 * The one Log sheet (QA-27). It is mounted once in the shell and opened with
 * `useLogSheet().open({ petId?, kind? })`; a bottom sheet on a phone, centred from 860 px.
 * Each opening starts fresh: the body is keyed by the opening.
 */
export function LogSheet() {
  const request = useLogSheetStore((s) => s.request);
  const serial = useLogSheetStore((s) => s.serial);
  const close = useLogSheetStore((s) => s.close);
  return (
    <Sheet open={request !== null} label={t('log.title')} onClose={close}>
      {request ? <LogSheetBody key={serial} request={request} /> : null}
    </Sheet>
  );
}
