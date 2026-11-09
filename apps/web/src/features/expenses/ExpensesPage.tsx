import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '@petcare/domain';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Banner, Button, SelectField, TextField } from '../../ui';
import { useToday } from '../health/hooks';
import { FilePicker } from '../files/FilePicker';
import { FileViewButton } from '../files/FileViewButton';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { ExpenseSummary } from './ExpenseSummary';

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

/** Expenses: add with an optional receipt, list, and totals by month or year (CAP-13). */
export function ExpensesPage() {
  const { expenses, pets, files } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'expense');
  const canDelete = useCanDelete('expense');
  const today = useToday();
  const list = useQuery({
    queryKey: ['expense', householdId],
    queryFn: () => expenses.list(householdId),
    enabled: householdId !== '',
  });
  const petList = useQuery({
    queryKey: ['pet', householdId],
    queryFn: () => pets.list(householdId),
    enabled: householdId !== '',
  });
  const petName = (id: unknown) =>
    petList.data?.find((p) => p.id === id)?.data.name ?? t('expenses.noPet');

  const blank = () => ({
    petId: '',
    spentOn: today,
    category: 'vet',
    amount: '',
    currency: prefs.currency,
    note: '',
  });
  const [values, setValues] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (name: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) =>
    setValues({ ...values, [name]: e.target.value });

  const submit = async () => {
    try {
      const fileId = file ? (await files.attach(householdId, file)).fileId : '';
      await expenses.add(householdId, { ...values, fileId });
      setValues(blank());
      setFile(null);
      setPickerKey((k) => k + 1);
      setErrors({});
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors({ [e.path]: t('form.invalid') });
    }
  };

  const rows = list.data ?? [];
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('expenses.title')}</h1>
      <ExpenseSummary expenses={rows} pets={petList.data ?? []} today={today} />
      {canCreate ? (
        <form
          aria-label={t('expenses.add')}
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3"
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
              ...(petList.data ?? []).map((p) => ({ value: p.id, label: String(p.data.name) })),
            ]}
            onChange={set('petId')}
          />
          <TextField
            label={t('expenses.date')}
            type="date"
            value={values.spentOn}
            error={errors.spentOn}
            onChange={set('spentOn')}
          />
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
            label={t('expenses.amount')}
            inputMode="decimal"
            value={values.amount}
            error={errors.amount}
            onChange={set('amount')}
          />
          <TextField
            label={t('expenses.currency')}
            value={values.currency}
            error={errors.currency}
            onChange={set('currency')}
          />
          <TextField label={t('expenses.note')} value={values.note} onChange={set('note')} />
          <FilePicker
            key={pickerKey}
            label={t('expenses.receipt')}
            error={errors.file}
            onPick={setFile}
            onRefused={(message) => setErrors({ file: message })}
          />
          <Button type="submit" className="self-start">
            {t('expenses.add')}
          </Button>
        </form>
      ) : null}
      {rows.length === 0 ? <Banner>{t('expenses.empty')}</Banner> : null}
      <ul className="flex flex-col gap-2" aria-label={t('expenses.list')}>
        {rows.map((x) => {
          const label = `${t(`expenses.category.${String(x.data.category)}` as MessageKey)} ${formatDate(String(x.data.spentOn), prefs)}`;
          return (
            <li
              key={x.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3"
            >
              <div>
                <strong>{formatMoney(Number(x.data.amountMinor), String(x.data.currency))}</strong>
                <p className="text-sm">
                  {label} · {String(petName(x.data.petId))}
                  {x.data.note ? ` · ${String(x.data.note)}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                {x.data.fileId ? (
                  <FileViewButton fileId={String(x.data.fileId)} label={t('expenses.receipt')} />
                ) : null}
                {canDelete(x.createdBy) ? (
                  <Button
                    variant="secondary"
                    aria-label={t('form.deleteLabel', { name: label })}
                    onClick={() => void expenses.remove(x.id)}
                  >
                    {t('form.delete')}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
