import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ContactForm } from '../../application/contact-service';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { Banner, Button, SelectField, TextField } from '../../ui';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

export const CONTACT_ROLES = [
  'vet',
  'clinic',
  'emergencyClinic',
  'groomer',
  'sitter',
  'trainer',
  'boarding',
  'other',
] as const;

const blank = (): ContactForm => ({
  name: '',
  role: 'vet',
  phone: '',
  email: '',
  address: '',
  website: '',
  note: '',
});

/** Vets, clinics, groomers and sitters the household calls (CAP-15). */
export function ContactsPage() {
  const { contacts } = useServices();
  const householdId = useHouseholdId();
  const canCreate = useCan('create', 'contact');
  const canDelete = useCanDelete('contact');
  const list = useQuery({
    queryKey: ['contact', householdId],
    queryFn: () => contacts.list(householdId),
    enabled: householdId !== '',
  });
  const [values, setValues] = useState<ContactForm>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (name: keyof ContactForm) => (e: { target: { value: string } }) =>
    setValues({ ...values, [name]: e.target.value });

  const submit = async () => {
    try {
      await contacts.add(householdId, values);
      setValues(blank());
      setErrors({});
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors({ [e.path]: t('form.invalid') });
    }
  };

  const rows = list.data ?? [];
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('contacts.title')}</h1>
      {canCreate ? (
        <form
          aria-label={t('contacts.add')}
          className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextField
            label={t('contacts.name')}
            value={values.name}
            error={errors.name}
            onChange={set('name')}
          />
          <SelectField
            label={t('contacts.role')}
            value={values.role}
            options={CONTACT_ROLES.map((r) => ({
              value: r,
              label: t(`contacts.role.${r}` as MessageKey),
            }))}
            onChange={set('role')}
          />
          <TextField
            label={t('contacts.phone')}
            type="tel"
            value={values.phone}
            error={errors.phone}
            onChange={set('phone')}
          />
          <TextField
            label={t('contacts.email')}
            type="email"
            value={values.email}
            error={errors.email}
            onChange={set('email')}
          />
          <TextField
            label={t('contacts.address')}
            value={values.address}
            onChange={set('address')}
          />
          <TextField
            label={t('contacts.website')}
            value={values.website}
            error={errors.website}
            onChange={set('website')}
          />
          <TextField label={t('contacts.note')} value={values.note} onChange={set('note')} />
          <Button type="submit" className="self-start">
            {t('contacts.add')}
          </Button>
        </form>
      ) : null}
      {rows.length === 0 ? <Banner>{t('contacts.empty')}</Banner> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((c) => {
          const name = String(c.data.name);
          return (
            <li
              key={c.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-line bg-card p-3"
            >
              <div className="flex flex-col gap-1">
                <strong>{name}</strong>
                <span className="text-sm">
                  {t(`contacts.role.${String(c.data.role)}` as MessageKey)}
                </span>
                {c.data.phone ? (
                  <a className="underline" href={`tel:${String(c.data.phone)}`}>
                    {String(c.data.phone)}
                  </a>
                ) : null}
                {c.data.email ? (
                  <a className="underline" href={`mailto:${String(c.data.email)}`}>
                    {String(c.data.email)}
                  </a>
                ) : null}
                {c.data.address ? <span>{String(c.data.address)}</span> : null}
                {c.data.website ? (
                  <a
                    className="underline"
                    href={String(c.data.website)}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {String(c.data.website)}
                  </a>
                ) : null}
                {c.data.note ? <span>{String(c.data.note)}</span> : null}
              </div>
              {canDelete(c.createdBy) ? (
                <Button
                  variant="secondary"
                  aria-label={t('form.deleteLabel', { name })}
                  onClick={() => void contacts.remove(c.id)}
                >
                  {t('form.delete')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
