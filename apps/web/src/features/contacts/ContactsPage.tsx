import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ContactForm } from '../../application/contact-service';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  Line,
  PageHeader,
  SectionHeader,
  SelectField,
  Sheet,
  SheetHead,
  TextField,
} from '../../ui';
import { LoadError } from '../shared/LoadError';
import { useCan, useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { useFocusInvalid } from '../shared/use-focus-invalid';

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

function AddContactForm({ onClose }: { onClose: () => void }) {
  const { contacts } = useServices();
  const householdId = useHouseholdId();
  const showToast = useToastStore((s) => s.show);
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<ContactForm>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useFocusInvalid(form, errors);
  const set = (name: keyof ContactForm) => (e: { target: { value: string } }) =>
    setValues({ ...values, [name]: e.target.value });

  const submit = async () => {
    try {
      await contacts.add(householdId, values);
      showToast(t('contacts.added', { name: values.name.trim() }));
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) throw e;
      setErrors({ [e.path]: t('form.invalid') });
    }
  };

  return (
    <>
      <SheetHead title={t('contacts.add')} onClose={onClose} />
      <form
        ref={form}
        aria-label={t('contacts.add')}
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
        <TextField label={t('contacts.address')} value={values.address} onChange={set('address')} />
        <TextField
          label={t('contacts.website')}
          value={values.website}
          error={errors.website}
          onChange={set('website')}
        />
        <TextField label={t('contacts.note')} value={values.note} onChange={set('note')} />
        <Button type="submit">{t('contacts.add')}</Button>
      </form>
    </>
  );
}

/** Vets, clinics, groomers and sitters the household calls (CAP-15). */
export function ContactsPage() {
  const { contacts } = useServices();
  const householdId = useHouseholdId();
  const canCreate = useCan('create', 'contact');
  const canDelete = useCanDelete('contact');
  const [adding, setAdding] = useState(false);
  const list = useQuery({
    queryKey: ['contact', householdId],
    queryFn: () => contacts.list(householdId),
    enabled: householdId !== '',
  });
  const rows = list.data ?? [];

  return (
    <>
      <PageHeader title={t('contacts.title')} lede={t('contacts.lede')} />
      {list.isError ? <LoadError onRetry={() => void list.refetch()} /> : null}
      <Card className="solo">
        <SectionHeader
          title={t('contacts.list')}
          {...(canCreate
            ? {
                action: {
                  label: t('ui.add'),
                  ariaLabel: t('contacts.addLabel'),
                  onClick: () => setAdding(true),
                },
              }
            : {})}
        />
        {list.isPending ? <EmptyState busy>{t('ui.loading')}</EmptyState> : null}
        {list.isSuccess && rows.length === 0 ? (
          <EmptyState icon="vet">{t('empty.contacts')}</EmptyState>
        ) : null}
        {rows.length > 0 ? (
          <ul aria-label={t('contacts.list')}>
            {rows.map((c) => {
              const name = String(c.data.name);
              const phone = c.data.phone ? String(c.data.phone) : '';
              const email = c.data.email ? String(c.data.email) : '';
              const site = c.data.website ? String(c.data.website) : '';
              return (
                <Line
                  key={c.id}
                  testId="contact-row"
                  title={name}
                  sub={
                    <>
                      {[t(`contacts.role.${String(c.data.role)}` as MessageKey), phone]
                        .filter(Boolean)
                        .join(' · ')}
                      {c.data.address ? (
                        <span className="sub2">{String(c.data.address)}</span>
                      ) : null}
                      {c.data.note ? <span className="sub2">{String(c.data.note)}</span> : null}
                    </>
                  }
                  actions={
                    <span className="acts">
                      {phone ? (
                        <a
                          className="xbtn"
                          href={`tel:${phone}`}
                          aria-label={t('contacts.call', { name })}
                        >
                          <Icon name="phone" />
                        </a>
                      ) : null}
                      {email ? (
                        <a
                          className="xbtn"
                          href={`mailto:${email}`}
                          aria-label={t('contacts.emailTo', { name })}
                        >
                          <Icon name="mail" />
                        </a>
                      ) : null}
                      {site ? (
                        <a
                          className="xbtn"
                          href={site}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={t('contacts.site', { name })}
                        >
                          <Icon name="globe" />
                        </a>
                      ) : null}
                      {canDelete(c.createdBy) ? (
                        <button
                          type="button"
                          className="xbtn"
                          aria-label={t('form.deleteLabel', { name })}
                          onClick={() => void contacts.remove(c.id)}
                        >
                          <Icon name="x" />
                        </button>
                      ) : null}
                    </span>
                  }
                />
              );
            })}
          </ul>
        ) : null}
        {canCreate ? (
          <Sheet open={adding} label={t('contacts.add')} onClose={() => setAdding(false)}>
            <AddContactForm onClose={() => setAdding(false)} />
          </Sheet>
        ) : null}
      </Card>
    </>
  );
}
