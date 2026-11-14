import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useRef, useState } from 'react';
import { can } from '@petcare/domain';
import { MEASUREMENT_KINDS } from '../../application/measurement-service';
import type { Kind } from '../../application/measurement-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate, formatMeasurement, toDisplay, toStored, unitLabel } from '../../lib/format';
import { activeHousehold, useSessionStore } from '../../state/session';
import {
  Button,
  Card,
  Disclosure,
  EmptyState,
  SectionHeader,
  SelectField,
  Sheet,
  SheetHead,
  TextField,
} from '../../ui';
import { useCan, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { useFocusInvalid } from '../shared/use-focus-invalid';

const WeightChart = lazy(() => import('./WeightChart'));

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const kindLabel = (kind: string) => t(`measure.kind.${kind}` as MessageKey);

function AddMeasurement({ petId, onClose }: { petId: string; onClose: () => void }) {
  const { measurements } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const show = useToastStore((s) => s.show);
  const [invalid, setInvalid] = useState(false);
  const formEl = useRef<HTMLFormElement>(null);
  useFocusInvalid(formEl, invalid ? { value: true } : {});

  const form = useForm({
    defaultValues: { kind: 'weight' as Kind, value: '', measuredAt: nowLocal(), note: '' },
    onSubmit: async ({ value }) => {
      const shown = Number(value.value);
      if (!Number.isFinite(shown) || shown <= 0) {
        setInvalid(true);
        return;
      }
      setInvalid(false);
      await measurements.add(householdId, {
        petId,
        kind: value.kind,
        value: toStored(value.kind, shown, prefs),
        measuredAt: new Date(value.measuredAt).toISOString(),
        note: value.note,
      });
      show(t('form.added', { name: kindLabel(value.kind) }));
      onClose();
    },
  });

  return (
    <form
      ref={formEl}
      aria-label={t('measure.add')}
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="kind">
        {(field) => (
          <SelectField
            label={t('measure.kind')}
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value as Kind)}
            options={MEASUREMENT_KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.values.kind}>
        {(kind) => (
          <form.Field name="value">
            {(field) => (
              <TextField
                label={t('measure.value', { unit: unitLabel(kind, prefs) })}
                inputMode="decimal"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                error={invalid ? t('measure.invalid') : undefined}
              />
            )}
          </form.Field>
        )}
      </form.Subscribe>
      <form.Field name="measuredAt">
        {(field) => (
          <TextField
            label={t('measure.when')}
            type="datetime-local"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
          />
        )}
      </form.Field>
      <form.Field name="note">
        {(field) => (
          <TextField
            label={t('measure.note')}
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
          />
        )}
      </form.Field>
      <Button type="submit">{t('measure.add')}</Button>
    </form>
  );
}

/** Measurements for one pet: the weight chart, the latest of each kind, and the full history. */
export function MeasurementsPanel({ petId }: { petId: string }) {
  const { measurements } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'measurement');
  const role = useSessionStore((s) => activeHousehold(s)?.role);
  const userId = useSessionStore((s) => s.user?.id ?? '');
  const canDelete = (createdBy: string) =>
    role !== undefined && can(role, 'delete', 'measurement', { actorId: userId, createdBy });
  const [adding, setAdding] = useState(false);

  const list = useQuery({
    queryKey: ['measurement', householdId, { petId }],
    queryFn: () => measurements.list(householdId, petId),
    enabled: householdId !== '',
  });

  const rows = list.data ?? [];
  const weights = rows
    .filter((m) => m.data.kind === 'weight')
    .map((m) => ({
      date: formatDate(String(m.data.measuredAt), prefs),
      value: Math.round(toDisplay('weight', Number(m.data.value), prefs) * 100) / 100,
    }));
  const latest = MEASUREMENT_KINDS.flatMap((kind) => {
    const last = rows.filter((m) => m.data.kind === kind).at(-1);
    return last ? [{ kind, record: last }] : [];
  });

  return (
    <Card>
      <SectionHeader
        title={t('measure.title')}
        {...(canCreate
          ? {
              action: {
                label: t('ui.add'),
                ariaLabel: t('measure.addLabel'),
                onClick: () => setAdding(true),
              },
            }
          : {})}
      />

      {rows.length === 0 ? <EmptyState>{t('measure.empty')}</EmptyState> : null}

      {weights.length > 1 ? (
        <div
          role="img"
          aria-label={t('measure.chartSummary', {
            from: weights[0]?.date ?? '',
            to: weights.at(-1)?.date ?? '',
            count: weights.length,
          })}
        >
          <Suspense fallback={null}>
            <WeightChart points={weights} unit={prefs.weightUnit} />
          </Suspense>
        </div>
      ) : null}

      {latest.length > 0 ? (
        <>
          <p className="label">{t('measure.latest')}</p>
          <div className="facts">
            {latest.map(({ kind, record }) => (
              <div key={kind}>
                <span className="label">{kindLabel(kind)}</span>
                <b>{formatMeasurement(kind, Number(record.data.value), prefs)}</b>
                <small>{formatDate(String(record.data.measuredAt), prefs)}</small>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {rows.length > 0 ? (
        <Disclosure
          title={t('measure.history')}
          hint={t('measure.historyHint', { count: rows.length })}
        >
          <div className="tscroll">
            <table className="ltable">
              <caption className="vh">{t('measure.history')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('measure.col.date')}</th>
                  <th scope="col">{t('measure.col.kind')}</th>
                  <th scope="col">{t('measure.col.value')}</th>
                  <th scope="col">{t('measure.col.note')}</th>
                  <th scope="col">
                    <span className="vh">{t('measure.delete')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((m) => {
                  const kind = String(m.data.kind) as Kind;
                  const date = formatDate(String(m.data.measuredAt), prefs);
                  return (
                    <tr key={m.id}>
                      <td>{date}</td>
                      <td>{kindLabel(kind)}</td>
                      <td>{formatMeasurement(kind, Number(m.data.value), prefs)}</td>
                      <td>{String(m.data.note ?? '')}</td>
                      <td>
                        {canDelete(m.createdBy) ? (
                          <Button
                            variant="secondary"
                            aria-label={t('measure.deleteLabel', { kind: kindLabel(kind), date })}
                            onClick={() => void measurements.remove(m.id)}
                          >
                            {t('measure.delete')}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Disclosure>
      ) : null}

      <Sheet open={adding} label={t('measure.add')} onClose={() => setAdding(false)}>
        <SheetHead title={t('measure.add')} onClose={() => setAdding(false)} />
        <AddMeasurement petId={petId} onClose={() => setAdding(false)} />
      </Sheet>
    </Card>
  );
}
