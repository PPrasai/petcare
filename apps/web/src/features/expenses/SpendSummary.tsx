import type { CSSProperties } from 'react';
import { formatMoney } from '@petcare/domain';
import {
  categoryTotals,
  displayCurrency,
  grandTotals,
  summarise,
} from '../../application/expense-summary';
import type { Period } from '../../application/expense-summary';
import type { StoredRecord } from '../../application/ports/record-store';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { Card, Disclosure, EmptyState, Line } from '../../ui';
import { PetAvatar } from '../shared/PetAvatar';

interface Props {
  expenses: StoredRecord[];
  pets: StoredRecord[];
  /** Today's date (YYYY-MM-DD); the summary covers its month or year. */
  today: string;
  period: Period;
  /** The currency the household prefers; it heads the card when it has spending. */
  currency: string;
  loading: boolean;
}

const BAR_COLOURS = ['var(--accent)', 'var(--warn)', 'var(--ok)'];

/** One total. Totals in different currencies are never added; each carries its currency. */
function Total({ currency, minor }: { currency: string; minor: number }) {
  return (
    <span data-testid="expense-total" data-currency={currency}>
      <span className="sr-only">{t('expenses.totalIn', { currency })} </span>
      {formatMoney(minor, currency)}
    </span>
  );
}

/**
 * The spending card and the "By pet" disclosure. The headline is in one currency (the preferred one
 * when it has spending); any other currency is listed under it (SPEC-petcare-003 S-18).
 */
export function SpendSummary({ expenses, pets, today, period, currency, loading }: Props) {
  const rows = summarise(expenses, today, period);
  const totals = grandTotals(rows);
  const shown = displayCurrency(expenses, today, period, currency);
  const headline = totals.find((g) => g.currency === shown);
  const others = totals.filter((g) => g.currency !== shown);
  const categories = shown ? categoryTotals(expenses, today, period, shown) : [];
  const colourOf = (index: number) => BAR_COLOURS[index] ?? 'var(--line-strong)';
  const periodName =
    period === 'year'
      ? today.slice(0, 4)
      : new Date(`${today}T12:00:00Z`).toLocaleDateString(undefined, {
          month: 'long',
          timeZone: 'UTC',
        });
  const [before, after] = t('expenses.otherCurrencies', { list: '\u0000' }).split('\u0000');
  const petOf = (id: string | null) => pets.find((p) => p.id === id);

  return (
    <>
      <Card role="region" aria-label={t('expenses.summary')}>
        {loading ? (
          <EmptyState busy>{t('ui.loading')}</EmptyState>
        ) : expenses.length === 0 ? (
          <EmptyState icon="wallet">{t('empty.expenses')}</EmptyState>
        ) : !headline || !shown ? (
          <EmptyState>{t('expenses.summaryEmpty')}</EmptyState>
        ) : (
          <>
            <span className="label">{t('expenses.spentIn', { period: periodName })}</span>
            <p className="stat">
              <Total currency={shown} minor={headline.totalMinor} />
            </p>
            {others.length > 0 ? (
              <p className="muted">
                {before}
                {others.map((g, i) => (
                  <span key={g.currency}>
                    {i > 0 ? ', ' : ''}
                    <Total currency={g.currency} minor={g.totalMinor} />
                  </span>
                ))}
                {after}
              </p>
            ) : null}
            <div className="bar" aria-hidden="true">
              {categories.map((c, i) => (
                <i
                  key={c.category}
                  style={
                    {
                      '--c': colourOf(i),
                      width: `${(c.totalMinor / headline.totalMinor) * 100}%`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <ul>
              {categories.map((c, i) => (
                <Line
                  key={c.category}
                  title={
                    <>
                      <span className="dotc" style={{ '--c': colourOf(i) } as CSSProperties} />
                      {t(`expenses.category.${c.category}` as MessageKey)}
                    </>
                  }
                  aside={<span className="amt">{formatMoney(c.totalMinor, shown)}</span>}
                />
              ))}
            </ul>
          </>
        )}
      </Card>
      {rows.length > 0 ? (
        <Disclosure title={t('expenses.byPet')} hint={t('expenses.byPetHint')}>
          <table className="ltable">
            <caption className="sr-only">{t('expenses.byPetCaption')}</caption>
            <tbody>
              {rows.map((r) => {
                const pet = petOf(r.petId);
                return (
                  <tr key={`${r.petId}|${r.currency}`}>
                    <th scope="row">
                      <span className="rh">
                        {pet ? <PetAvatar pet={pet} size={32} /> : null}
                        {pet ? String(pet.data.name) : t('expenses.noPet')}
                      </span>
                    </th>
                    <td className="amt">{formatMoney(r.totalMinor, r.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Disclosure>
      ) : null}
    </>
  );
}
