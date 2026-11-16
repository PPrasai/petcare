import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '@petcare/domain';
import { inPeriod } from '../../application/expense-summary';
import type { Period } from '../../application/expense-summary';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  Line,
  PageHeader,
  SectionHeader,
  SegmentedControl,
} from '../../ui';
import { FileViewButton } from '../files/FileViewButton';
import { useToday } from '../health/hooks';
import { LoadError } from '../shared/LoadError';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useRemoval } from '../shared/removal';
import { useServices } from '../shared/services-context';
import { useWideScreen } from '../shared/use-wide-screen';
import { AddExpenseSheet } from './AddExpenseSheet';
import { SpendSummary } from './SpendSummary';

/** Expenses: spending by category and pet, the transactions, and the full add form (CAP-13). */
export function ExpensesPage() {
  const { expenses, pets } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'expense');
  const canDelete = useCanDelete('expense');
  const removeRecord = useRemoval();
  const today = useToday();
  const [period, setPeriod] = useState<Period>('month');
  const [adding, setAdding] = useState(false);
  const wide = useWideScreen();
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
    String(petList.data?.find((p) => p.id === id)?.data.name ?? t('expenses.noPet'));

  const rows = (list.data ?? []).filter((x) => inPeriod(String(x.data.spentOn), today, period));
  const lede =
    period === 'year'
      ? t('expenses.lede.year', { year: today.slice(0, 4) })
      : t('expenses.lede.month', {
          month: new Date(`${today}T12:00:00Z`).toLocaleDateString(undefined, {
            month: 'long',
            timeZone: 'UTC',
          }),
        });

  const seg = (
    <SegmentedControl
      label={t('expenses.period')}
      value={period}
      onChange={(v) => setPeriod(v === 'year' ? 'year' : 'month')}
      options={[
        { value: 'month', label: t('expenses.period.month') },
        { value: 'year', label: t('expenses.period.year') },
      ]}
    />
  );
  const rowOf = (x: (typeof rows)[number]) => {
    const category = t(`expenses.category.${String(x.data.category)}` as MessageKey);
    const title = x.data.note ? String(x.data.note) : category;
    const actions = (
      <span className="acts">
        {x.data.fileId ? (
          <FileViewButton fileId={String(x.data.fileId)} label={t('expenses.receipt')} />
        ) : null}
        {canDelete(x.createdBy) ? (
          <button
            type="button"
            className="xbtn"
            aria-label={t('form.deleteLabel', { name: title })}
            onClick={() => void removeRecord(x, title)}
          >
            <Icon name="x" />
          </button>
        ) : null}
      </span>
    );
    const date = formatDate(String(x.data.spentOn), prefs);
    const money = formatMoney(Number(x.data.amountMinor), String(x.data.currency));
    if (wide)
      return (
        <tr key={x.id} data-testid="expense-row">
          <td>{date}</td>
          <th scope="row">{title}</th>
          <td className="cat">{category}</td>
          <td>{petName(x.data.petId)}</td>
          <td className="amt">{money}</td>
          <td>{actions}</td>
        </tr>
      );
    return (
      <Line
        key={x.id}
        title={title}
        sub={`${date} · ${category} · ${petName(x.data.petId)}`}
        aside={<span className="amt">{money}</span>}
        actions={actions}
      />
    );
  };

  return (
    <>
      <PageHeader
        title={t('expenses.title')}
        lede={lede}
        actions={
          wide ? (
            <>
              {seg}
              {canCreate ? (
                <Button onClick={() => setAdding(true)}>
                  <Icon name="plus" /> {t('expenses.add')}
                </Button>
              ) : null}
            </>
          ) : (
            seg
          )
        }
      />
      {list.isError ? <LoadError onRetry={() => void list.refetch()} /> : null}
      <div className="two" data-layout={wide ? 'expenses' : undefined}>
        <div className="stack">
          <SpendSummary
            expenses={list.data ?? []}
            pets={petList.data ?? []}
            today={today}
            period={period}
            currency={prefs.currency}
            loading={list.isPending}
          />
        </div>
        <div className="stack">
          <Card data-area="tx">
            <SectionHeader
              title={t('expenses.transactions')}
              {...(canCreate && !wide
                ? {
                    action: {
                      label: t('ui.add'),
                      ariaLabel: t('expenses.addLabel'),
                      onClick: () => setAdding(true),
                    },
                  }
                : {})}
            />
            {list.isPending ? <EmptyState busy>{t('ui.loading')}</EmptyState> : null}
            {wide && list.isSuccess && rows.length === 0 ? (
              <p className="muted">{t('expenses.summaryEmpty')}</p>
            ) : null}
            {rows.length > 0 && wide ? (
              <table className="ltable tx" aria-label={t('expenses.list')}>
                <thead>
                  <tr>
                    <th scope="col">{t('expenses.date')}</th>
                    <th scope="col">{t('expenses.what')}</th>
                    <th scope="col" className="cat">
                      {t('expenses.category')}
                    </th>
                    <th scope="col">{t('expenses.pet')}</th>
                    <th scope="col">{t('expenses.amount')}</th>
                    <th scope="col">
                      <span className="sr-only">{t('expenses.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>{rows.map(rowOf)}</tbody>
              </table>
            ) : null}
            {rows.length > 0 && !wide ? (
              <ul aria-label={t('expenses.list')}>{rows.map(rowOf)}</ul>
            ) : null}
            {canCreate ? (
              <AddExpenseSheet
                open={adding}
                onClose={() => setAdding(false)}
                pets={petList.data ?? []}
                today={today}
              />
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
