import { useState } from 'react';
import { formatMoney } from '@petcare/domain';
import { grandTotals, summarise } from '../../application/expense-summary';
import type { Period } from '../../application/expense-summary';
import type { StoredRecord } from '../../application/ports/record-store';
import { t } from '../../i18n/t';
import { SelectField } from '../../ui';

interface Props {
  expenses: StoredRecord[];
  pets: StoredRecord[];
  /** Today's date (YYYY-MM-DD); the summary covers its month or year. */
  today: string;
}

/** Spending for this month or year, per pet and per currency; currencies are never added. */
export function ExpenseSummary({ expenses, pets, today }: Props) {
  const [period, setPeriod] = useState<Period>('month');
  const rows = summarise(expenses, today, period);
  const totals = grandTotals(rows);
  const petName = (id: string | null) =>
    id === null
      ? t('expenses.noPet')
      : String(pets.find((p) => p.id === id)?.data.name ?? t('expenses.noPet'));

  return (
    <section aria-labelledby="summary-title" className="flex flex-col gap-3">
      <h2 id="summary-title" className="text-xl font-semibold">
        {t('expenses.summary')}
      </h2>
      <SelectField
        label={t('expenses.period')}
        value={period}
        options={[
          { value: 'month', label: t('expenses.period.month') },
          { value: 'year', label: t('expenses.period.year') },
        ]}
        onChange={(e) => setPeriod(e.target.value === 'year' ? 'year' : 'month')}
      />
      {rows.length === 0 ? (
        <p>{t('expenses.summaryEmpty')}</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col">{t('expenses.pet')}</th>
              <th scope="col">{t('expenses.currency')}</th>
              <th scope="col">{t('expenses.total')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.petId}|${r.currency}`}>
                <td>{petName(r.petId)}</td>
                <td>{r.currency}</td>
                <td>{formatMoney(r.totalMinor, r.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {totals.map((g) => (
              <tr key={g.currency}>
                <th scope="row" colSpan={2}>
                  {t('expenses.totalIn', { currency: g.currency })}
                </th>
                <td>
                  <strong>{formatMoney(g.totalMinor, g.currency)}</strong>
                </td>
              </tr>
            ))}
          </tfoot>
        </table>
      )}
    </section>
  );
}
