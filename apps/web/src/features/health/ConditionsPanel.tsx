import { useState } from 'react';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Banner, Button } from '../../ui';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { errorsFor, useHealthList, useToday } from './hooks';
import { RecordForm } from './RecordForm';
import type { FieldSpec } from './RecordForm';

const severity = (): { value: string; label: string }[] => [
  { value: '', label: '' },
  ...(['mild', 'moderate', 'severe'] as const).map((s) => ({
    value: s,
    label: t(`severity.${s}` as MessageKey),
  })),
];

const CONDITION_FIELDS: FieldSpec[] = [
  {
    name: 'kind',
    label: t('condition.kind'),
    type: 'select',
    options: (['allergy', 'chronic', 'other'] as const).map((k) => ({
      value: k,
      label: t(`condition.kind.${k}` as MessageKey),
    })),
  },
  { name: 'name', label: t('condition.name') },
  { name: 'severity', label: t('condition.severity'), type: 'select', options: severity() },
  { name: 'diagnosedOn', label: t('condition.diagnosedOn'), type: 'date' },
  { name: 'note', label: t('condition.note') },
];

const SYMPTOM_FIELDS: FieldSpec[] = [
  { name: 'observedAt', label: t('symptom.when'), type: 'datetime-local' },
  { name: 'description', label: t('symptom.description') },
  { name: 'severity', label: t('symptom.severity'), type: 'select', options: severity() },
];

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Conditions and allergies, and the symptoms journal, of one pet. */
export function ConditionsPanel({ petId }: { petId: string }) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'condition');
  const canResolve = useCan('update', 'condition');
  const canDeleteCondition = useCanDelete('condition');
  const canLogSymptom = useCan('create', 'symptomEntry');
  const canDeleteSymptom = useCanDelete('symptomEntry');
  const today = useToday();
  const conditions = useHealthList('condition', petId);
  const symptoms = useHealthList('symptomEntry', petId);
  const [cValues, setCValues] = useState<Record<string, string>>({ kind: 'allergy' });
  const [sValues, setSValues] = useState<Record<string, string>>({ observedAt: nowLocal() });
  const [cErrors, setCErrors] = useState<Record<string, string>>({});
  const [sErrors, setSErrors] = useState<Record<string, string>>({});

  const addCondition = async () => {
    try {
      await health.add('condition', householdId, { petId, ...cValues });
      setCValues({ kind: cValues.kind ?? 'allergy' });
      setCErrors({});
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setCErrors(errorsFor(e.path, t('form.invalid')));
    }
  };

  const addSymptom = async () => {
    try {
      await health.add('symptomEntry', householdId, {
        petId,
        ...sValues,
        observedAt: sValues.observedAt ? new Date(sValues.observedAt).toISOString() : '',
      });
      setSValues({ observedAt: nowLocal() });
      setSErrors({});
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setSErrors(errorsFor(e.path, t('form.invalid')));
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-labelledby="condition-title">
        <h2 id="condition-title" className="text-xl font-semibold">
          {t('condition.title')}
        </h2>
        {canCreate ? (
          <RecordForm
            title={t('condition.add')}
            fields={CONDITION_FIELDS}
            values={cValues}
            errors={cErrors}
            onChange={setCValues}
            onSubmit={() => void addCondition()}
            submitLabel={t('condition.add')}
          />
        ) : null}
        {(conditions.data ?? []).length === 0 ? <Banner>{t('condition.empty')}</Banner> : null}
        <ul className="flex flex-col gap-2">
          {(conditions.data ?? []).map((c) => {
            const name = String(c.data.name);
            const resolved = typeof c.data.resolvedOn === 'string' ? c.data.resolvedOn : null;
            return (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card p-3"
              >
                <div>
                  <strong>{name}</strong>{' '}
                  <span className="text-sm">
                    {t(`condition.kind.${String(c.data.kind)}` as MessageKey)}
                    {c.data.severity
                      ? ` · ${t(`severity.${String(c.data.severity)}` as MessageKey)}`
                      : ''}
                    {resolved
                      ? ` · ${t('condition.resolvedOn', { date: formatDate(resolved, prefs) })}`
                      : ''}
                  </span>
                </div>
                <div className="flex gap-2">
                  {!resolved && canResolve ? (
                    <Button
                      variant="secondary"
                      aria-label={t('condition.resolveLabel', { name })}
                      onClick={() => void health.update('condition', c.id, { resolvedOn: today })}
                    >
                      {t('condition.resolve')}
                    </Button>
                  ) : null}
                  {canDeleteCondition(c.createdBy) ? (
                    <Button
                      variant="secondary"
                      aria-label={t('form.deleteLabel', { name })}
                      onClick={() => void health.remove('condition', c.id)}
                    >
                      {t('form.delete')}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="symptom-title">
        <h2 id="symptom-title" className="text-xl font-semibold">
          {t('symptom.title')}
        </h2>
        {canLogSymptom ? (
          <RecordForm
            title={t('symptom.add')}
            fields={SYMPTOM_FIELDS}
            values={sValues}
            errors={sErrors}
            onChange={setSValues}
            onSubmit={() => void addSymptom()}
            submitLabel={t('symptom.add')}
          />
        ) : null}
        {(symptoms.data ?? []).length === 0 ? <Banner>{t('symptom.empty')}</Banner> : null}
        <ul className="flex flex-col gap-2">
          {(symptoms.data ?? []).map((s) => {
            const date = formatDate(String(s.data.observedAt), prefs);
            return (
              <li
                key={s.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-line bg-card p-3"
              >
                <div>
                  <strong>{date}</strong>
                  {s.data.severity
                    ? ` · ${t(`severity.${String(s.data.severity)}` as MessageKey)}`
                    : ''}
                  <p>{String(s.data.description)}</p>
                </div>
                {canDeleteSymptom(s.createdBy) ? (
                  <Button
                    variant="secondary"
                    aria-label={t('form.deleteLabel', { name: date })}
                    onClick={() => void health.remove('symptomEntry', s.id)}
                  >
                    {t('form.delete')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
