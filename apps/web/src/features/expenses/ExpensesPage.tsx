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
import { useServices } from '../shared/services-context';
import { AddExpenseSheet } from './AddExpenseSheet';
import { SpendSummary } from './SpendSummary';

/** Expenses: spending by category and pet, the transactions, and the full add form (CAP-13). */
export function ExpensesPage() {
  const { expenses, pets } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'expense');
  const canDelete = useCanDelete('expense');
  const today = useToday();
  const [period, setPeriod] = useState<Period>('month');
  const [adding, setAdding] = useState(false);
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

  return (
    <>
      <PageHeader
        title={t('expenses.title')}
        lede={lede}
        actions={
          <SegmentedControl
            label={t('expenses.period')}
            value={period}
            onChange={(v) => setPeriod(v === 'year' ? 'year' : 'month')}
            options={[
              { value: 'month', label: t('expenses.period.month') },
              { value: 'year', label: t('expenses.period.year') },
            ]}
          />
        }
      />
      {list.isError ? <LoadError onRetry={() => void list.refetch()} /> : null}
      <div className="two">
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
          <Card>
            <SectionHeader
              title={t('expenses.transactions')}
              {...(canCreate
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
            {rows.length > 0 ? (
              <ul aria-label={t('expenses.list')}>
                {rows.map((x) => {
                  const category = t(`expenses.category.${String(x.data.category)}` as MessageKey);
                  const title = x.data.note ? String(x.data.note) : category;
                  return (
                    <Line
                      key={x.id}
                      title={title}
                      sub={`${formatDate(String(x.data.spentOn), prefs)} · ${category} · ${petName(x.data.petId)}`}
                      aside={
                        <span className="amt">
                          {formatMoney(Number(x.data.amountMinor), String(x.data.currency))}
                        </span>
                      }
                      actions={
                        <span className="acts">
                          {x.data.fileId ? (
                            <FileViewButton
                              fileId={String(x.data.fileId)}
                              label={t('expenses.receipt')}
                            />
                          ) : null}
                          {canDelete(x.createdBy) ? (
                            <button
                              type="button"
                              className="xbtn"
                              aria-label={t('form.deleteLabel', { name: title })}
                              onClick={() => void expenses.remove(x.id)}
                            >
                              <Icon name="x" />
                            </button>
                          ) : null}
                        </span>
                      }
                    />
                  );
                })}
              </ul>
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
