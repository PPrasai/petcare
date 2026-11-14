import { useState } from 'react';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Button, Card, EmptyState, Line, SectionHeader } from '../../ui';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { errorsFor, useHealthList, useToday } from './hooks';
import { RecordForm, RecordSheet } from './RecordForm';
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

function AddCondition({ petId, onClose }: { petId: string; onClose: () => void }) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const show = useToastStore((s) => s.show);
  const [values, setValues] = useState<Record<string, string>>({ kind: 'allergy' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async () => {
    try {
      await health.add('condition', householdId, { petId, ...values });
      show(t('form.added', { name: values.name ?? '' }));
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors(errorsFor(e.path, t('form.invalid')));
    }
  };
  return (
    <RecordForm
      title={t('condition.add')}
      fields={CONDITION_FIELDS}
      values={values}
      errors={errors}
      onChange={setValues}
      onSubmit={() => void submit()}
      submitLabel={t('condition.add')}
    />
  );
}

function AddSymptom({ petId, onClose }: { petId: string; onClose: () => void }) {
  const { health } = useServices();
  const householdId = useHouseholdId();
  const show = useToastStore((s) => s.show);
  const [values, setValues] = useState<Record<string, string>>({ observedAt: nowLocal() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async () => {
    try {
      await health.add('symptomEntry', householdId, {
        petId,
        ...values,
        observedAt: values.observedAt ? new Date(values.observedAt).toISOString() : '',
      });
      show(t('form.added', { name: values.description ?? '' }));
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors(errorsFor(e.path, t('form.invalid')));
    }
  };
  return (
    <RecordForm
      title={t('symptom.add')}
      fields={SYMPTOM_FIELDS}
      values={values}
      errors={errors}
      onChange={setValues}
      onSubmit={() => void submit()}
      submitLabel={t('symptom.add')}
    />
  );
}

/** Conditions and allergies of one pet: active first, then resolved ones. */
export function ConditionsPanel({ petId }: { petId: string }) {
  const { health } = useServices();
  const prefs = useSessionStore((s) => s.preferences);
  const canCreate = useCan('create', 'condition');
  const canResolve = useCan('update', 'condition');
  const canDelete = useCanDelete('condition');
  const today = useToday();
  const conditions = useHealthList('condition', petId);
  const [adding, setAdding] = useState(false);
  const all = conditions.data ?? [];
  const isResolved = (c: (typeof all)[number]) => typeof c.data.resolvedOn === 'string';
  const rows = [...all.filter((c) => !isResolved(c)), ...all.filter(isResolved)];

  return (
    <Card>
      <SectionHeader
        title={t('condition.title')}
        {...(canCreate
          ? {
              action: {
                label: t('ui.add'),
                ariaLabel: t('condition.addLabel'),
                onClick: () => setAdding(true),
              },
            }
          : {})}
      />
      {rows.length === 0 ? <EmptyState>{t('condition.empty')}</EmptyState> : null}
      {rows.length > 0 ? (
        <ul aria-label={t('condition.title')}>
          {rows.map((c) => {
            const name = String(c.data.name);
            const resolved = typeof c.data.resolvedOn === 'string' ? c.data.resolvedOn : null;
            const sub = [
              t(`condition.kind.${String(c.data.kind)}` as MessageKey) +
                (c.data.severity
                  ? ` · ${t(`severity.${String(c.data.severity)}` as MessageKey)}`
                  : ''),
              resolved ? t('condition.resolvedOn', { date: formatDate(resolved, prefs) }) : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Line
                key={c.id}
                title={name}
                sub={sub}
                actions={
                  <>
                    {!resolved && canResolve ? (
                      <button
                        type="button"
                        className="linkbtn"
                        aria-label={t('condition.resolveLabel', { name })}
                        onClick={() => void health.update('condition', c.id, { resolvedOn: today })}
                      >
                        {t('condition.resolve')}
                      </button>
                    ) : null}
                    {canDelete(c.createdBy) ? (
                      <Button
                        variant="secondary"
                        aria-label={t('form.deleteLabel', { name })}
                        onClick={() => void health.remove('condition', c.id)}
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
      <RecordSheet open={adding} title={t('condition.add')} onClose={() => setAdding(false)}>
        <AddCondition petId={petId} onClose={() => setAdding(false)} />
      </RecordSheet>
    </Card>
  );
}

/** The symptoms journal of one pet, newest first. */
export function SymptomsPanel({ petId }: { petId: string }) {
  const { health } = useServices();
  const prefs = useSessionStore((s) => s.preferences);
  const canLog = useCan('create', 'symptomEntry');
  const canDelete = useCanDelete('symptomEntry');
  const symptoms = useHealthList('symptomEntry', petId);
  const [adding, setAdding] = useState(false);
  const rows = [...(symptoms.data ?? [])].sort((a, b) =>
    String(b.data.observedAt).localeCompare(String(a.data.observedAt)),
  );

  return (
    <Card>
      <SectionHeader
        title={t('symptom.title')}
        {...(canLog
          ? {
              action: {
                label: t('ui.add'),
                ariaLabel: t('symptom.addLabel'),
                onClick: () => setAdding(true),
              },
            }
          : {})}
      />
      {rows.length === 0 ? <EmptyState>{t('symptom.empty')}</EmptyState> : null}
      {rows.length > 0 ? (
        <ul aria-label={t('symptom.title')}>
          {rows.map((s) => {
            const date = formatDate(String(s.data.observedAt), prefs);
            return (
              <Line
                key={s.id}
                title={String(s.data.description)}
                sub={
                  date +
                  (s.data.severity
                    ? ` · ${t(`severity.${String(s.data.severity)}` as MessageKey)}`
                    : '')
                }
                actions={
                  canDelete(s.createdBy) ? (
                    <Button
                      variant="secondary"
                      aria-label={t('form.deleteLabel', { name: date })}
                      onClick={() => void health.remove('symptomEntry', s.id)}
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
      <RecordSheet open={adding} title={t('symptom.add')} onClose={() => setAdding(false)}>
        <AddSymptom petId={petId} onClose={() => setAdding(false)} />
      </RecordSheet>
    </Card>
  );
}
