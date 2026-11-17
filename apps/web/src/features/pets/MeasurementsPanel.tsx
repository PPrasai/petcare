import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useRef, useState } from 'react';
import { can } from '@petcare/domain';
import { MEASUREMENT_KINDS } from '../../application/measurement-service';
import { InvalidInput } from '../../application/pet-service';
import type { Kind } from '../../application/measurement-service';
import type { StoredRecord } from '../../application/ports/record-store';
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
import { EditButton, useEditTap } from '../shared/EditButton';
import { useCan, useHouseholdId } from '../shared/permissions';
import { useRemoval } from '../shared/removal';
import { useSaveFailure } from '../shared/save-failure';
import { useServices } from '../shared/services-context';
import { useWideScreen } from '../shared/use-wide-screen';
import { useToastStore } from '../shared/toast';
import { useFocusInvalid } from '../shared/use-focus-invalid';

const WeightChart = lazy(() => import('./WeightChart'));

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const kindLabel = (kind: string) => t(`measure.kind.${kind}` as MessageKey);

/** An instant as the value of a datetime-local field (the device's own time). */
const localInstant = (iso: unknown): string => {
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return nowLocal();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** The measurement form: adds one, or with `record` changes that one. */
function MeasurementForm({
  petId,
  record,
  onClose,
}: {
  petId: string;
  record?: StoredRecord;
  onClose: () => void;
}) {
  const { measurements } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const show = useToastStore((s) => s.show);
  const [invalid, setInvalid] = useState(false);
  const formEl = useRef<HTMLFormElement>(null);
  useFocusInvalid(formEl, invalid ? { value: true } : {});
  const failure = useSaveFailure();

  const kind0 = (record ? String(record.data.kind) : 'weight') as Kind;
  const form = useForm({
    defaultValues: {
      kind: kind0,
      value: record
        ? String(Math.round(toDisplay(kind0, Number(record.data.value), prefs) * 100) / 100)
        : '',
      measuredAt: record ? localInstant(record.data.measuredAt) : nowLocal(),
      note: record ? String(record.data.note ?? '') : '',
    },
    onSubmit: async ({ value }) => {
      const shown = Number(value.value);
      if (!Number.isFinite(shown) || shown <= 0) {
        setInvalid(true);
        return;
      }
      setInvalid(false);
      failure.clear();
      try {
        const input = {
          kind: value.kind,
          value: toStored(value.kind, shown, prefs),
          measuredAt: new Date(value.measuredAt).toISOString(),
          note: value.note,
        };
        if (record) {
          await measurements.update(record.id, input);
          show(t('form.saved', { name: kindLabel(value.kind) }));
        } else {
          await measurements.add(householdId, { petId, ...input });
          show(t('form.added', { name: kindLabel(value.kind) }));
        }
        onClose();
      } catch (e) {
        if (e instanceof InvalidInput) setInvalid(true);
        else failure.fail(e);
      }
    },
  });

  return (
    <form
      ref={formEl}
      aria-label={record ? t('measure.edit') : t('measure.add')}
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
      {failure.view}
      <Button type="submit">{record ? t('form.saveChanges') : t('measure.add')}</Button>
    </form>
  );
}

/** Measurements for one pet: the weight chart, the latest of each kind, and the full history. */
export function MeasurementsPanel({ petId }: { petId: string }) {
  const { measurements } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const wide = useWideScreen();
  const canCreate = useCan('create', 'measurement');
  const canEdit = useCan('update', 'measurement');
  const tap = useEditTap();
  // A table cell keeps its own role: the phone edit target is the kind cell, focusable and labelled.
  const tapCell = (name: string, onEdit: () => void) => {
    const props = { ...tap(name, onEdit) };
    delete props.role;
    return props;
  };
  const role = useSessionStore((s) => activeHousehold(s)?.role);
  const userId = useSessionStore((s) => s.user?.id ?? '');
  const removeRecord = useRemoval();
  const canDelete = (createdBy: string) =>
    role !== undefined && can(role, 'delete', 'measurement', { actorId: userId, createdBy });
  const [sheet, setSheet] = useState<{ record?: StoredRecord } | null>(null);

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
    <Card data-area="meas">
      <SectionHeader
        title={t('measure.title')}
        {...(canCreate
          ? {
              action: {
                label: t('ui.add'),
                ariaLabel: t('measure.addLabel'),
                onClick: () => setSheet({}),
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
            <WeightChart points={weights} unit={prefs.weightUnit} height={wide ? 110 : 240} />
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
                    <span className="vh">{t('measure.actions')}</span>
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
                      <td
                        {...(canEdit
                          ? tapCell(`${kindLabel(kind)} ${date}`, () => setSheet({ record: m }))
                          : undefined)}
                      >
                        {kindLabel(kind)}
                      </td>
                      <td>{formatMeasurement(kind, Number(m.data.value), prefs)}</td>
                      <td>{String(m.data.note ?? '')}</td>
                      <td>
                        {canEdit ? (
                          <EditButton
                            name={`${kindLabel(kind)} ${date}`}
                            onClick={() => setSheet({ record: m })}
                          />
                        ) : null}
                        {canDelete(m.createdBy) ? (
                          <Button
                            variant="secondary"
                            aria-label={t('measure.deleteLabel', { kind: kindLabel(kind), date })}
                            onClick={() => void removeRecord(m, kindLabel(kind))}
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

      <Sheet
        open={sheet !== null}
        label={sheet?.record ? t('measure.edit') : t('measure.add')}
        onClose={() => setSheet(null)}
      >
        <SheetHead
          title={sheet?.record ? t('measure.edit') : t('measure.add')}
          onClose={() => setSheet(null)}
        />
        <MeasurementForm
          petId={petId}
          {...(sheet?.record ? { record: sheet.record } : {})}
          onClose={() => setSheet(null)}
        />
      </Sheet>
    </Card>
  );
}
