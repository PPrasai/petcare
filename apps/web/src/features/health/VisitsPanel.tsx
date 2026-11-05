import { useState } from 'react';
import { formatMoney, toMinor } from '@petcare/domain';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Banner, Button } from '../../ui';
import { useContactName, useContactOptions } from '../contacts/hooks';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { errorsFor, useHealthList, useToday } from './hooks';
import { RecordForm } from './RecordForm';
import type { FieldSpec } from './RecordForm';

const FIELDS: FieldSpec[] = [
  { name: 'visitedOn', label: t('visit.date'), type: 'date' },
  { name: 'reason', label: t('visit.reason') },
  { name: 'findings', label: t('visit.findings') },
  { name: 'diagnosis', label: t('visit.diagnosis') },
  { name: 'treatment', label: t('visit.treatment') },
  { name: 'cost', label: t('visit.cost'), type: 'number' },
  { name: 'followUpOn', label: t('visit.followUp'), type: 'date' },
];

/** Vet visits of one pet. */
export function VisitsPanel({ petId }: { petId: string }) {
  const { health } = useServices();
  const contactOptions = useContactOptions();
  const fields: FieldSpec[] = [
    ...FIELDS,
    { name: 'contactId', label: t('visit.contact'), type: 'select', options: contactOptions },
  ];
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'vetVisit');
  const canDelete = useCanDelete('vetVisit');
  const today = useToday();
  const list = useHealthList('vetVisit', petId);
  const [values, setValues] = useState<Record<string, string>>({ visitedOn: today });
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      setValues({ visitedOn: today });
      setErrors({});
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors(errorsFor(e.path, t('form.invalid')));
    }
  };

  const rows = list.data ?? [];
  return (
    <section className="flex flex-col gap-4" aria-labelledby="visit-title">
      <h2 id="visit-title" className="text-xl font-semibold">
        {t('visit.title')}
      </h2>
      {canCreate ? (
        <RecordForm
          title={t('visit.add')}
          fields={fields}
          values={values}
          errors={errors}
          onChange={setValues}
          onSubmit={() => void submit()}
          submitLabel={t('visit.add')}
        />
      ) : null}
      {rows.length === 0 ? <Banner>{t('visit.empty')}</Banner> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((v) => {
          const date = formatDate(String(v.data.visitedOn), prefs);
          return (
            <li
              key={v.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-line bg-card p-3"
            >
              <div className="flex flex-col gap-1">
                <strong>
                  {date}
                  {v.data.reason ? ` · ${String(v.data.reason)}` : ''}
                </strong>
                {v.data.findings ? <p>{String(v.data.findings)}</p> : null}
                {v.data.diagnosis ? (
                  <p>{t('visit.diagnosisValue', { text: String(v.data.diagnosis) })}</p>
                ) : null}
                {v.data.treatment ? (
                  <p>{t('visit.treatmentValue', { text: String(v.data.treatment) })}</p>
                ) : null}
                {typeof v.data.costMinor === 'number' ? (
                  <p>{formatMoney(v.data.costMinor, String(v.data.currency ?? prefs.currency))}</p>
                ) : null}
                <ContactLine id={v.data.contactId} />
                {v.data.followUpOn ? (
                  <p>
                    {t('visit.followUpValue', {
                      date: formatDate(String(v.data.followUpOn), prefs),
                    })}
                  </p>
                ) : null}
              </div>
              {canDelete(v.createdBy) ? (
                <Button
                  variant="secondary"
                  aria-label={t('form.deleteLabel', { name: date })}
                  onClick={() => void health.remove('vetVisit', v.id)}
                >
                  {t('form.delete')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ContactLine({ id }: { id: unknown }) {
  const name = useContactName(id);
  return name ? <p>{t('visit.contactValue', { name })}</p> : null;
}
