import { useState } from 'react';
import { VACCINE_SUGGESTION_LABEL, vaccineSuggestions } from '@petcare/domain';
import { addDays, vaccinationBadge } from '../../application/health-logic';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Button, Card, Chip, EmptyState, Line, Pill, SectionHeader } from '../../ui';
import type { Tone } from '../../ui';
import { useContactName, useContactOptions } from '../contacts/hooks';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { errorsFor, useHealthList, useToday } from './hooks';
import { RecordForm, RecordSheet } from './RecordForm';
import type { FieldSpec } from './RecordForm';

const FIELDS: FieldSpec[] = [
  { name: 'vaccineName', label: t('vaccine.name') },
  { name: 'givenOn', label: t('vaccine.givenOn'), type: 'date', half: true },
  { name: 'nextDueOn', label: t('vaccine.nextDueOn'), type: 'date', half: true },
  { name: 'batchNumber', label: t('vaccine.batch') },
  { name: 'note', label: t('vaccine.note') },
];

const BADGE_TONE: Record<'overdue' | 'dueSoon' | 'upcoming', Tone> = {
  overdue: 'overdue',
  dueSoon: 'today',
  upcoming: 'ok',
};

function AddVaccination({
  petId,
  species,
  onClose,
}: {
  petId: string;
  species: string;
  onClose: () => void;
}) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const contactOptions = useContactOptions();
  const show = useToastStore((s) => s.show);
  const today = useToday();
  const [values, setValues] = useState<Record<string, string>>({ givenOn: today });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const suggestions = vaccineSuggestions(species);
  const fields: FieldSpec[] = [
    ...FIELDS,
    { name: 'contactId', label: t('vaccine.contact'), type: 'select', options: contactOptions },
  ];

  const suggest = (name: string, intervalDays: number) =>
    setValues((v) => ({
      ...v,
      vaccineName: name,
      nextDueOn: addDays(v.givenOn || today, intervalDays),
    }));

  const submit = async () => {
    try {
      await health.add('vaccination', householdId, { petId, ...values });
      show(t('form.added', { name: values.vaccineName ?? '' }));
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors(errorsFor(e.path, t('form.invalid')));
    }
  };

  return (
    <>
      {suggestions.length > 0 ? (
        <div className="fld">
          <p className="label">{VACCINE_SUGGESTION_LABEL}</p>
          <div className="tags">
            {suggestions.map((s) => (
              <Chip
                key={s.name}
                pressed={values.vaccineName === s.name}
                onClick={() => suggest(s.name, s.intervalDays)}
              >
                {s.name}
              </Chip>
            ))}
          </div>
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
  );
}

/** Vaccinations of one pet: a status pill per record, and an add sheet with species suggestions. */
export function VaccinationsPanel({ petId, species }: { petId: string; species: string }) {
  const { health } = useServices();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'vaccination');
  const canDelete = useCanDelete('vaccination');
  const today = useToday();
  const list = useHealthList('vaccination', petId);
  const [adding, setAdding] = useState(false);
  const rows = list.data ?? [];

  return (
    <Card>
      <SectionHeader
        title={t('vaccine.title')}
        {...(canCreate
          ? {
              action: {
                label: t('ui.add'),
                ariaLabel: t('vaccine.addLabel'),
                onClick: () => setAdding(true),
              },
            }
          : {})}
      />
      {rows.length === 0 ? <EmptyState>{t('empty.vaccines')}</EmptyState> : null}
      {rows.length > 0 ? (
        <ul aria-label={t('vaccine.title')}>
          {rows.map((v) => {
            const badge = vaccinationBadge(v, rows, today);
            const name = String(v.data.vaccineName);
            return (
              <Line
                key={v.id}
                title={name}
                sub={
                  <>
                    {t('vaccine.given', { date: formatDate(String(v.data.givenOn), prefs) })}
                    {v.data.batchNumber
                      ? ` · ${t('vaccine.batchValue', { batch: String(v.data.batchNumber) })}`
                      : ''}
                    <ContactSuffix id={v.data.contactId} />
                  </>
                }
                aside={
                  badge !== 'none' ? (
                    <Pill tone={BADGE_TONE[badge]}>
                      {t(`vaccine.badge.${badge}`, {
                        date: v.data.nextDueOn
                          ? new Date(`${String(v.data.nextDueOn)}T12:00:00`).toLocaleDateString(
                              undefined,
                              { month: 'short', year: 'numeric' },
                            )
                          : '',
                      })}
                    </Pill>
                  ) : null
                }
                actions={
                  canDelete(v.createdBy) ? (
                    <Button
                      variant="secondary"
                      aria-label={t('form.deleteLabel', { name })}
                      onClick={() => void health.remove('vaccination', v.id)}
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
      <RecordSheet open={adding} title={t('vaccine.add')} onClose={() => setAdding(false)}>
        <AddVaccination petId={petId} species={species} onClose={() => setAdding(false)} />
      </RecordSheet>
    </Card>
  );
}

function ContactSuffix({ id }: { id: unknown }) {
  const name = useContactName(id);
  return name ? ` · ${t('vaccine.contactValue', { name })}` : null;
}
