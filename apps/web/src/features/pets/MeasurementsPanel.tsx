import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useState } from 'react';
import { can } from '@petcare/domain';
import { MEASUREMENT_KINDS } from '../../application/measurement-service';
import type { Kind } from '../../application/measurement-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate, formatMeasurement, toDisplay, toStored, unitLabel } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Banner, Button, SelectField, TextField } from '../../ui';
import { useCan, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

const WeightChart = lazy(() => import('./WeightChart'));

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Measurements for one pet: add, list as a table, and a weight chart. */
export function MeasurementsPanel({ petId }: { petId: string }) {
  const { measurements } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'measurement');
  const role = useSessionStore((s) => s.households[0]?.role);
  const userId = useSessionStore((s) => s.user?.id ?? '');
  const canDelete = (createdBy: string) =>
    role !== undefined && can(role, 'delete', 'measurement', { actorId: userId, createdBy });
  const [invalid, setInvalid] = useState(false);

  const list = useQuery({
    queryKey: ['measurement', householdId, { petId }],
    queryFn: () => measurements.list(householdId, petId),
    enabled: householdId !== '',
  });

  const form = useForm({
    defaultValues: { kind: 'weight' as Kind, value: '', measuredAt: nowLocal(), note: '' },
    onSubmit: async ({ value, formApi }) => {
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
      formApi.reset({ ...value, value: '', note: '', measuredAt: nowLocal() });
    },
  });

  const rows = list.data ?? [];
  const weights = rows
    .filter((m) => m.data.kind === 'weight')
    .map((m) => ({
      date: formatDate(String(m.data.measuredAt), prefs),
      value: Math.round(toDisplay('weight', Number(m.data.value), prefs) * 100) / 100,
    }));
  const kindLabel = (kind: string) => t(`measure.kind.${kind}` as MessageKey);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="measure-title">
      <h2 id="measure-title" className="text-xl font-semibold">
        {t('measure.title')}
      </h2>

      {weights.length > 0 ? (
        <figure className="flex flex-col gap-2">
          <figcaption className="font-medium">{t('measure.chart')}</figcaption>
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
        </figure>
      ) : null}

      {canCreate ? (
        <form
          aria-label={t('measure.add')}
          className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3"
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
          <Button type="submit" className="self-start">
            {t('measure.add')}
          </Button>
        </form>
      ) : null}

      <h3 className="font-semibold">{t('measure.history')}</h3>
      {rows.length === 0 ? <Banner>{t('measure.empty')}</Banner> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t('measure.history')}</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="p-2">
                  {t('measure.col.date')}
                </th>
                <th scope="col" className="p-2">
                  {t('measure.col.kind')}
                </th>
                <th scope="col" className="p-2">
                  {t('measure.col.value')}
                </th>
                <th scope="col" className="p-2">
                  {t('measure.col.note')}
                </th>
                <th scope="col" className="p-2">
                  <span className="sr-only">{t('measure.delete')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((m) => {
                const kind = String(m.data.kind) as Kind;
                const date = formatDate(String(m.data.measuredAt), prefs);
                return (
                  <tr key={m.id} className="border-b border-line">
                    <td className="p-2">{date}</td>
                    <td className="p-2">{kindLabel(kind)}</td>
                    <td className="p-2">{formatMeasurement(kind, Number(m.data.value), prefs)}</td>
                    <td className="p-2">{String(m.data.note ?? '')}</td>
                    <td className="p-2">
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
      ) : null}
    </section>
  );
}
