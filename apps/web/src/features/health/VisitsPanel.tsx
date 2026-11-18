import { useState } from 'react';
import { formatMoney, fromMinor, toMinor } from '@petcare/domain';
import { InvalidInput } from '../../application/pet-service';
import type { StoredRecord } from '../../application/ports/record-store';
import { t } from '../../i18n/t';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Button, Card, Disclosure, EmptyState, Icon, Line, SectionHeader } from '../../ui';
import { useContactName, useContactOptions } from '../contacts/hooks';
import { EditButton, useEditTap } from '../shared/EditButton';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useRemoval } from '../shared/removal';
import { useSaveFailure } from '../shared/save-failure';
import { useServices } from '../shared/services-context';
import { useWideScreen } from '../shared/use-wide-screen';
import { useToastStore } from '../shared/toast';
import { errorsFor, useHealthList, useToday } from './hooks';
import { RecordForm, RecordSheet } from './RecordForm';
import type { FieldSpec } from './RecordForm';

const FIELDS: FieldSpec[] = [
  { name: 'visitedOn', label: t('visit.date'), type: 'date' },
  { name: 'reason', label: t('visit.reason') },
  { name: 'findings', label: t('visit.findings') },
  { name: 'diagnosis', label: t('visit.diagnosis') },
  { name: 'treatment', label: t('visit.treatment') },
  { name: 'cost', label: t('visit.cost'), type: 'number', half: true },
  { name: 'followUpOn', label: t('visit.followUp'), type: 'date', half: true },
];

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The cost as typed (major units), for the form. */
const costText = (r: StoredRecord): string =>
  typeof r.data.costMinor === 'number'
    ? String(fromMinor(r.data.costMinor, String(r.data.currency ?? 'USD')))
    : '';

/** The vet visit form: adds one, or with `record` changes that one. */
function VisitForm({
  petId,
  record,
  onClose,
}: {
  petId: string;
  record?: StoredRecord;
  onClose: () => void;
}) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const contactOptions = useContactOptions();
  const show = useToastStore((s) => s.show);
  const today = useToday();
  const [values, setValues] = useState<Record<string, string>>(
    record
      ? {
          ...Object.fromEntries(
            [...FIELDS.map((f) => f.name), 'contactId'].map((k) => [k, text(record.data[k])]),
          ),
          cost: costText(record),
        }
      : { visitedOn: today },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields: FieldSpec[] = [
    ...FIELDS.slice(0, 2),
    { name: 'contactId', label: t('visit.contact'), type: 'select', options: contactOptions },
    ...FIELDS.slice(2),
  ];

  const failure = useSaveFailure();
  const submit = async () => {
    const { cost, ...rest } = values;
    const amount = cost ? Number(cost) : undefined;
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
      setErrors({ cost: t('form.invalid') });
      return;
    }
    failure.clear();
    try {
      // A visit keeps the currency it was recorded in.
      const currency = record ? text(record.data.currency) || prefs.currency : prefs.currency;
      const input = {
        ...rest,
        ...(amount === undefined ? {} : { costMinor: toMinor(amount, currency), currency }),
      };
      const name = values.reason || formatDate(values.visitedOn ?? today, prefs);
      if (record) {
        await health.edit('vetVisit', record.id, input);
        show(t('form.saved', { name }));
      } else {
        await health.add('vetVisit', householdId, { petId, ...input });
        show(t('form.added', { name }));
      }
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) {
        failure.fail(e);
        return;
      }
      setErrors(errorsFor(e.path, t('form.invalid')));
    }
  };

  return (
    <RecordForm
      title={record ? t('visit.edit') : t('visit.add')}
      fields={fields}
      values={values}
      errors={errors}
      onChange={setValues}
      onSubmit={() => void submit()}
      submitLabel={record ? t('form.saveChanges') : t('visit.add')}
    >
      {failure.view}
    </RecordForm>
  );
}

function VisitList({ petId }: { petId: string }) {
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'vetVisit');
  const canDelete = useCanDelete('vetVisit');
  const removeRecord = useRemoval();
  const list = useHealthList('vetVisit', petId);
  const [sheet, setSheet] = useState<{ record?: StoredRecord } | null>(null);
  const canEdit = useCan('update', 'vetVisit');
  const tap = useEditTap();
  const rows = [...(list.data ?? [])].sort((a, b) =>
    String(b.data.visitedOn).localeCompare(String(a.data.visitedOn)),
  );

  return (
    <>
      {canCreate ? (
        <button type="button" className="linkbtn" onClick={() => setSheet({})}>
          <Icon name="plus" />
          {t('visit.addLabel')}
        </button>
      ) : null}
      {rows.length === 0 ? <EmptyState>{t('visit.empty')}</EmptyState> : null}
      {rows.length > 0 ? (
        <ul aria-label={t('visit.title')}>
          {rows.map((v) => {
            const date = formatDate(String(v.data.visitedOn), prefs);
            const more = [
              v.data.findings ? String(v.data.findings) : '',
              v.data.diagnosis ? t('visit.diagnosisValue', { text: String(v.data.diagnosis) }) : '',
              v.data.treatment ? t('visit.treatmentValue', { text: String(v.data.treatment) }) : '',
              v.data.followUpOn
                ? t('visit.followUpValue', { date: formatDate(String(v.data.followUpOn), prefs) })
                : '',
            ].filter(Boolean);
            return (
              <Line
                titleProps={canEdit ? tap(date, () => setSheet({ record: v })) : undefined}
                key={v.id}
                title={v.data.reason ? String(v.data.reason) : date}
                sub={
                  <>
                    {date}
                    <ContactSuffix id={v.data.contactId} />
                    {more.length > 0 ? <span className="sub2">{more.join(' · ')}</span> : null}
                  </>
                }
                aside={
                  typeof v.data.costMinor === 'number' ? (
                    <span className="amt">
                      {formatMoney(v.data.costMinor, String(v.data.currency ?? prefs.currency))}
                    </span>
                  ) : null
                }
                actions={
                  <>
                    {canEdit ? (
                      <EditButton name={date} onClick={() => setSheet({ record: v })} />
                    ) : null}
                    {canDelete(v.createdBy) ? (
                      <Button
                        variant="secondary"
                        aria-label={t('form.deleteLabel', { name: date })}
                        onClick={() => void removeRecord(v, date)}
                      >
                        {t('form.delete')}
                      </Button>
                    ) : null}
                  </>
                }
              />
            );
          })}
        </ul>
      ) : null}
      <RecordSheet
        open={sheet !== null}
        title={sheet?.record ? t('visit.edit') : t('visit.add')}
        onClose={() => setSheet(null)}
      >
        <VisitForm
          petId={petId}
          {...(sheet?.record ? { record: sheet.record } : {})}
          onClose={() => setSheet(null)}
        />
      </RecordSheet>
    </>
  );
}

/** Vet visits of one pet: a disclosure with a count, and from 860 px a panel. */
export function VisitsPanel({ petId }: { petId: string }) {
  const list = useHealthList('vetVisit', petId);
  const count = list.data?.length ?? 0;
  const hint = count === 1 ? t('visit.count.one') : t('visit.count.many', { count });
  if (useWideScreen()) {
    return (
      <Card data-area="visits">
        <SectionHeader title={t('visit.title')} aside={<span className="muted">{hint}</span>} />
        <VisitList petId={petId} />
      </Card>
    );
  }
  return (
    <Disclosure title={t('visit.title')} hint={hint}>
      <VisitList petId={petId} />
    </Disclosure>
  );
}

function ContactSuffix({ id }: { id: unknown }) {
  const name = useContactName(id);
  return name ? ` · ${t('visit.contactValue', { name })}` : null;
}
