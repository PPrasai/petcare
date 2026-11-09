import { useState } from 'react';
import { VACCINE_SUGGESTION_LABEL, vaccineSuggestions } from '@petcare/domain';
import { addDays, vaccinationBadge } from '../../application/health-logic';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
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
  { name: 'vaccineName', label: t('vaccine.name') },
  { name: 'givenOn', label: t('vaccine.givenOn'), type: 'date' },
  { name: 'nextDueOn', label: t('vaccine.nextDueOn'), type: 'date' },
  { name: 'batchNumber', label: t('vaccine.batch') },
  { name: 'note', label: t('vaccine.note') },
];

/** Vaccinations of one pet: suggestions by species, an overdue/due-soon badge, and the record list. */
export function VaccinationsPanel({ petId, species }: { petId: string; species: string }) {
  const { health } = useServices();
  const contactOptions = useContactOptions();
  const fields: FieldSpec[] = [
    ...FIELDS,
    { name: 'contactId', label: t('vaccine.contact'), type: 'select', options: contactOptions },
  ];
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'vaccination');
  const canDelete = useCanDelete('vaccination');
  const today = useToday();
  const list = useHealthList('vaccination', petId);
  const [values, setValues] = useState<Record<string, string>>({ givenOn: today });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const rows = list.data ?? [];
  const suggestions = vaccineSuggestions(species);

  const suggest = (name: string, intervalDays: number) =>
    setValues((v) => ({
      ...v,
      vaccineName: name,
      nextDueOn: addDays(v.givenOn || today, intervalDays),
    }));

  const submit = async () => {
    try {
      await health.add('vaccination', householdId, { petId, ...values });
      setValues({ givenOn: today });
      setErrors({});
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors(errorsFor(e.path, t('form.invalid')));
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="vaccine-title">
      <h2 id="vaccine-title" className="text-xl font-semibold">
        {t('vaccine.title')}
      </h2>
      {canCreate ? (
        <>
          {suggestions.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">{VACCINE_SUGGESTION_LABEL}</p>
              <ul className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <li key={s.name}>
                    <Button variant="secondary" onClick={() => suggest(s.name, s.intervalDays)}>
                      {s.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <RecordForm
            title={t('vaccine.add')}
            fields={fields}
            values={values}
            errors={errors}
            onChange={setValues}
            onSubmit={() => void submit()}
            submitLabel={t('vaccine.add')}
          />
        </>
      ) : null}
      {rows.length === 0 ? <Banner>{t('vaccine.empty')}</Banner> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((v) => {
          const badge = vaccinationBadge(v, rows, today);
          const name = String(v.data.vaccineName);
          return (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3"
            >
              <div>
                <strong>{name}</strong>{' '}
                {badge !== 'none' ? (
                  <span
                    className={`rounded border px-1 text-sm ${badge === 'overdue' ? 'border-bad text-bad' : 'border-line'}`}
                  >
                    {t(`vaccine.badge.${badge}` as MessageKey)}
                  </span>
                ) : null}
                <p className="text-sm">
                  {t('vaccine.given', { date: formatDate(String(v.data.givenOn), prefs) })}
                  {v.data.nextDueOn
                    ? ` · ${t('vaccine.due', { date: formatDate(String(v.data.nextDueOn), prefs) })}`
                    : ''}
                  {v.data.batchNumber
                    ? ` · ${t('vaccine.batchValue', { batch: String(v.data.batchNumber) })}`
                    : ''}
                </p>
                <ContactLine id={v.data.contactId} />
              </div>
              {canDelete(v.createdBy) ? (
                <Button
                  variant="secondary"
                  aria-label={t('form.deleteLabel', { name })}
                  onClick={() => void health.remove('vaccination', v.id)}
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
  return name ? <p className="text-sm">{t('vaccine.contactValue', { name })}</p> : null;
}
