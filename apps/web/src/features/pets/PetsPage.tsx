import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { getEntity } from '@petcare/domain';
import type { ZodObject } from 'zod';
import { SPECIES } from '../../application/pet-service';
import type { Species } from '../../application/pet-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useSessionStore } from '../../state/session';
import { Button, SelectField, TextField } from '../../ui';
import { useServices } from '../shared/services-context';
import { zodField } from '../shared/validators';

const nameRule = (getEntity('pet').schema as ZodObject).shape.name;

/** Slice 7 shows the basics: list and add. Slice 8 adds detail, edit and archive. */
export function PetsPage() {
  const { pets } = useServices();
  const householdId = useSessionStore((s) => s.households[0]?.id ?? '');
  const list = useQuery({
    queryKey: ['pet', householdId],
    queryFn: () => pets.list(householdId),
    enabled: householdId !== '',
  });

  const form = useForm({
    defaultValues: { name: '', species: 'dog' as Species },
    onSubmit: async ({ value, formApi }) => {
      await pets.create(householdId, value);
      formApi.reset();
    },
  });

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('pets.title')}</h1>
      {list.data && list.data.length === 0 ? <p>{t('pets.empty')}</p> : null}
      <ul className="flex flex-col gap-2">
        {list.data?.map((pet) => (
          <li
            key={pet.id}
            className="flex items-center justify-between rounded-lg border border-line bg-card p-3"
          >
            <span>
              <strong>{String(pet.data.name)}</strong>{' '}
              <span className="text-muted">
                {t(`pets.species.${String(pet.data.species)}` as MessageKey)}
              </span>
            </span>
            {pet.pending ? <span className="text-sm text-muted">{t('pets.pending')}</span> : null}
          </li>
        ))}
      </ul>
      <form
        aria-label={t('pets.add')}
        className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <h2 className="font-semibold">{t('pets.add')}</h2>
        <form.Field name="name" validators={{ onBlur: zodField(nameRule) }}>
          {(field) => (
            <TextField
              label={t('pets.name')}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              error={field.state.meta.errors[0]}
            />
          )}
        </form.Field>
        <form.Field name="species">
          {(field) => (
            <SelectField
              label={t('pets.species')}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value as Species)}
              options={SPECIES.map((s) => ({
                value: s,
                label: t(`pets.species.${s}` as MessageKey),
              }))}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(s) => s.isSubmitting || s.values.name.trim() === ''}>
          {(disabled) => (
            <Button type="submit" disabled={disabled}>
              {t('pets.save')}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
