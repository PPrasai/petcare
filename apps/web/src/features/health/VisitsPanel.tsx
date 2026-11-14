import { useState } from 'react';
import { formatMoney, toMinor } from '@petcare/domain';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Button, Disclosure, EmptyState, Icon, Line } from '../../ui';
import { useContactName, useContactOptions } from '../contacts/hooks';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
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

function AddVisit({ petId, onClose }: { petId: string; onClose: () => void }) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const contactOptions = useContactOptions();
  const show = useToastStore((s) => s.show);
  const today = useToday();
  const [values, setValues] = useState<Record<string, string>>({ visitedOn: today });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields: FieldSpec[] = [
    ...FIELDS.slice(0, 2),
    { name: 'contactId', label: t('visit.contact'), type: 'select', options: contactOptions },
    ...FIELDS.slice(2),
  ];

  const submit = async () => {
    const { cost, ...rest } = values;
    const amount = cost ? Number(cost) : undefined;
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
      setErrors({ cost: t('form.invalid') });
      return;
    }
    try {
      await health.add('vetVisit', householdId, {
        petId,
        ...rest,
        ...(amount === undefined
          ? {}
          : { costMinor: toMinor(amount, prefs.currency), currency: prefs.currency }),
      });
      show(
        t('form.added', { name: values.reason || formatDate(values.visitedOn ?? today, prefs) }),
      );
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors(errorsFor(e.path, t('form.invalid')));
    }
  };

  return (
    <RecordForm
      title={t('visit.add')}
      fields={fields}
      values={values}
      errors={errors}
      onChange={setValues}
      onSubmit={() => void submit()}
      submitLabel={t('visit.add')}
    />
  );
}

function VisitList({ petId }: { petId: string }) {
  const { health } = useServices();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'vetVisit');
  const canDelete = useCanDelete('vetVisit');
  const list = useHealthList('vetVisit', petId);
  const [adding, setAdding] = useState(false);
  const rows = [...(list.data ?? [])].sort((a, b) =>
    String(b.data.visitedOn).localeCompare(String(a.data.visitedOn)),
  );

  return (
    <>
      {canCreate ? (
        <button type="button" className="linkbtn" onClick={() => setAdding(true)}>
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
                  canDelete(v.createdBy) ? (
                    <Button
                      variant="secondary"
                      aria-label={t('form.deleteLabel', { name: date })}
                      onClick={() => void health.remove('vetVisit', v.id)}
                    >
                      {t('form.delete')}
                    </Button>
                  ) : null
                }
              />
            );
          })}
        </ul>
      ) : null}
      <RecordSheet open={adding} title={t('visit.add')} onClose={() => setAdding(false)}>
        <AddVisit petId={petId} onClose={() => setAdding(false)} />
      </RecordSheet>
    </>
  );
}

/** Vet visits of one pet, in a disclosure with a count. */
export function VisitsPanel({ petId }: { petId: string }) {
  const list = useHealthList('vetVisit', petId);
  const count = list.data?.length ?? 0;
  return (
    <Disclosure
      title={t('visit.title')}
      hint={count === 1 ? t('visit.count.one') : t('visit.count.many', { count })}
    >
      <VisitList petId={petId} />
    </Disclosure>
  );
}

function ContactSuffix({ id }: { id: unknown }) {
  const name = useContactName(id);
  return name ? ` · ${t('visit.contactValue', { name })}` : null;
}
