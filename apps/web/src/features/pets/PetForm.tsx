import { useForm } from '@tanstack/react-form';
import { z } from 'zod';
import { SEXES, SIZES, SPECIES } from '../../application/pet-form';
import type { PetFormValues } from '../../application/pet-form';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { Button, SelectField, TextField } from '../../ui';
import { zodField } from '../shared/validators';

const nameRule = z.string().trim().min(1, t('petForm.nameRequired')).max(200);

interface PetFormProps {
  initial: PetFormValues;
  submitLabel: string;
  onSubmit: (values: PetFormValues) => Promise<void>;
  onCancel?: () => void;
}

type TextName = {
  [K in keyof PetFormValues]: PetFormValues[K] extends string ? K : never;
}[keyof PetFormValues];

/** The pet profile form, used to add a pet and to edit one. */
export function PetForm({ initial, submitLabel, onSubmit, onCancel }: PetFormProps) {
  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => onSubmit(value),
  });

  const text = (name: TextName, label: MessageKey, type: 'text' | 'date' = 'text') => (
    <form.Field name={name}>
      {(field) => (
        <TextField
          label={t(label)}
          type={type}
          value={field.state.value}
          onChange={(e) => field.handleChange(e.target.value as never)}
          onBlur={field.handleBlur}
        />
      )}
    </form.Field>
  );

  const choice = (
    name: 'sex' | 'neutered' | 'sizeCategory',
    label: MessageKey,
    options: { value: string; label: MessageKey }[],
  ) => (
    <form.Field name={name}>
      {(field) => (
        <SelectField
          label={t(label)}
          value={field.state.value}
          onChange={(e) => field.handleChange(e.target.value as never)}
          options={[
            { value: '', label: t('petForm.unspecified') },
            ...options.map((o) => ({ value: o.value, label: t(o.label) })),
          ]}
        />
      )}
    </form.Field>
  );

  const flag = (name: 'isMixedBreed' | 'birthDateEstimated', label: MessageKey) => (
    <form.Field name={name}>
      {(field) => (
        <label className="check">
          <input
            type="checkbox"
            checked={field.state.value}
            onChange={(e) => field.handleChange(e.target.checked)}
          />
          {t(label)}
        </label>
      )}
    </form.Field>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="name"
        validators={{ onBlur: zodField(nameRule), onSubmit: zodField(nameRule) }}
      >
        {(field) => (
          <TextField
            label={t('petForm.name')}
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
            label={t('petForm.species')}
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value as PetFormValues['species'])}
            options={SPECIES.map((s) => ({
              value: s,
              label: t(`pets.species.${s}` as MessageKey),
            }))}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.values.species}>
        {(species) => (species === 'other' ? text('speciesOther', 'petForm.speciesOther') : null)}
      </form.Subscribe>
      {text('breed', 'petForm.breed')}
      {flag('isMixedBreed', 'petForm.mixed')}
      <div className="row2">
        {choice(
          'sex',
          'petForm.sex',
          SEXES.map((s) => ({ value: s, label: `petForm.sex.${s}` as MessageKey })),
        )}
        {choice('neutered', 'petForm.neutered', [
          { value: 'yes', label: 'petForm.neutered.yes' },
          { value: 'no', label: 'petForm.neutered.no' },
        ])}
      </div>
      {text('birthDate', 'petForm.birthDate', 'date')}
      {flag('birthDateEstimated', 'petForm.birthEstimated')}
      {text('adoptedOn', 'petForm.adoptedOn', 'date')}
      <div className="row2">
        {text('colour', 'petForm.colour')}
        {text('markings', 'petForm.markings')}
      </div>
      <div className="row2">
        {text('microchipId', 'petForm.microchip')}
        {text('insuranceProvider', 'petForm.insuranceProvider')}
      </div>
      {text('insurancePolicy', 'petForm.insurancePolicy')}
      {text('insuranceRenewsOn', 'petForm.insuranceRenews', 'date')}
      <div className="row2">
        {text('diet', 'petForm.diet')}
        {text('bloodType', 'petForm.bloodType')}
      </div>
      {choice(
        'sizeCategory',
        'petForm.size',
        SIZES.map((s) => ({ value: s, label: `petForm.size.${s}` as MessageKey })),
      )}
      <div className="acts">
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <Button type="submit" disabled={submitting}>
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            {t('ui.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
