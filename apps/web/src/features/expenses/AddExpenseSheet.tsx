import { useRef, useState } from 'react';
import { formatMoney } from '@petcare/domain';
import { InvalidInput } from '../../application/pet-service';
import type { StoredRecord } from '../../application/ports/record-store';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useSessionStore } from '../../state/session';
import { Button, SelectField, Sheet, SheetHead, TextField } from '../../ui';
import { FilePicker } from '../files/FilePicker';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { useFocusInvalid } from '../shared/use-focus-invalid';

export const EXPENSE_CATEGORIES = [
  'vet',
  'food',
  'grooming',
  'insurance',
  'supplies',
  'medication',
  'boarding',
  'training',
  'other',
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  pets: StoredRecord[];
  /** Today's date (YYYY-MM-DD), the default for the date field. */
  today: string;
}

function ExpenseForm({ onClose, pets, today }: Omit<Props, 'open'>) {
  const { expenses, files } = useServices();
  const householdId = useHouseholdId();
  const currency = useSessionStore((s) => s.preferences.currency);
  const showToast = useToastStore((s) => s.show);
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({
    petId: '',
    spentOn: today,
    category: 'vet',
    amount: '',
    currency,
    note: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useFocusInvalid(form, errors);
  const set = (name: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues({ ...values, [name]: e.target.value });

  const submit = async () => {
    try {
      const fileId = file ? (await files.attach(householdId, file)).fileId : '';
      const saved = await expenses.add(householdId, { ...values, fileId });
      const pet = pets.find((p) => p.id === values.petId);
      showToast(
        t('expenses.added', {
          amount: formatMoney(Number(saved.data.amountMinor), String(saved.data.currency)),
          name: pet ? String(pet.data.name) : t('expenses.noPet'),
        }),
      );
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors({ [e.path]: t('form.invalid') });
    }
  };

  return (
    <>
      <SheetHead title={t('expenses.add')} onClose={onClose} />
      <form
        ref={form}
        aria-label={t('expenses.add')}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <SelectField
          label={t('expenses.pet')}
          value={values.petId}
          options={[
            { value: '', label: t('expenses.noPet') },
            ...pets.map((p) => ({ value: p.id, label: String(p.data.name) })),
          ]}
          onChange={set('petId')}
        />
        <div className="row2">
          <TextField
            label={t('expenses.date')}
            type="date"
            value={values.spentOn}
            error={errors.spentOn}
            onChange={set('spentOn')}
          />
          <TextField
            label={t('expenses.amount')}
            inputMode="decimal"
            value={values.amount}
            error={errors.amount}
            onChange={set('amount')}
          />
        </div>
        <SelectField
          label={t('expenses.category')}
          value={values.category}
          options={EXPENSE_CATEGORIES.map((c) => ({
            value: c,
            label: t(`expenses.category.${c}` as MessageKey),
          }))}
          onChange={set('category')}
        />
        <TextField
          label={t('expenses.currency')}
          value={values.currency}
          error={errors.currency}
          onChange={set('currency')}
        />
        <TextField label={t('expenses.note')} value={values.note} onChange={set('note')} />
        <FilePicker
          label={t('expenses.receipt')}
          error={errors.file}
          onPick={setFile}
          onRefused={(message) => setErrors({ file: message })}
        />
        <Button type="submit">{t('expenses.add')}</Button>
      </form>
    </>
  );
}

/** The full expense form in a sheet: pet, date, amount, category, currency, note and a receipt (S-19). */
export function AddExpenseSheet({ open, onClose, pets, today }: Props) {
  return (
    <Sheet open={open} label={t('expenses.add')} onClose={onClose}>
      <ExpenseForm onClose={onClose} pets={pets} today={today} />
    </Sheet>
  );
}
