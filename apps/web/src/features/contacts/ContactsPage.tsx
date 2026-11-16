import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ContactForm } from '../../application/contact-service';
import type { StoredRecord } from '../../application/ports/record-store';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import {
  Banner,
  Button,
  Card,
  CopyButton,
  EmptyState,
  Icon,
  Initials,
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
import { useRemoval } from '../shared/removal';
import { useSaveFailure } from '../shared/save-failure';
import { useServices } from '../shared/services-context';
import { useWideScreen } from '../shared/use-wide-screen';
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

  const failure = useSaveFailure();
  const submit = async () => {
    failure.clear();
    try {
      await contacts.add(householdId, values);
      showToast(t('contacts.added', { name: values.name.trim() }));
      onClose();
    } catch (e) {
      if (!(e instanceof InvalidInput)) {
        failure.fail(e);
        return;
      }
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
        {failure.view}
        <Button type="submit">{t('contacts.add')}</Button>
      </form>
    </>
  );
}

const field = (c: StoredRecord, key: string) => (c.data[key] ? String(c.data[key]) : '');
const roleText = (c: StoredRecord) => t(`contacts.role.${String(c.data.role)}` as MessageKey);

/** The selected contact (S-24, from 860 px): its fields with Copy, the note and Delete. */
function ContactDetail({
  c,
  canDelete,
  onDelete,
}: {
  c: StoredRecord;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const show = useToastStore((s) => s.show);
  const name = String(c.data.name);
  const site = field(c, 'website');
  const rows: [string, string, ReactNode?][] = [
    [t('contacts.phone'), field(c, 'phone')],
    [t('contacts.email'), field(c, 'email')],
    [
      t('contacts.websiteShort'),
      site,
      site ? (
        <a href={site} target="_blank" rel="noreferrer noopener" className="linkbtn">
          {t('contacts.openLink')}
        </a>
      ) : null,
    ],
    [t('contacts.address'), field(c, 'address')],
  ];
  return (
    <Card data-area="detail">
      <div className="sech">
        <div className="l">
          <h2>{name}</h2>
          <span className="muted">{roleText(c)}</span>
        </div>
        {canDelete ? (
          <Button variant="danger" aria-label={t('form.deleteLabel', { name })} onClick={onDelete}>
            {t('form.delete')}
          </Button>
        ) : null}
      </div>
      <ul aria-label={name}>
        {rows
          .filter(([, value]) => value !== '')
          .map(([label, value, extra]) => (
            <Line
              key={label}
              title={label}
              sub={value}
              actions={
                <span className="acts">
                  {extra}
                  <CopyButton
                    variant="link"
                    value={value}
                    label={t('contacts.copy')}
                    copiedToast={t('contacts.copied')}
                    onNotify={show}
                  />
                </span>
              }
            />
          ))}
      </ul>
      {field(c, 'note') ? <Banner>{field(c, 'note')}</Banner> : null}
    </Card>
  );
}

/** From 860 px: the search, the list and the selected contact side by side (S-24). */
function ContactsDesktop({
  rows,
  loading,
  canCreate,
  canDelete,
  onAdd,
  onRemove,
}: {
  rows: StoredRecord[];
  loading: boolean;
  canCreate: boolean;
  canDelete: (createdBy: string) => boolean;
  onAdd: () => void;
  onRemove: (c: StoredRecord, name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState('');
  const q = query.trim().toLowerCase();
  const shown = rows.filter(
    (c) =>
      q === '' ||
      String(c.data.name).toLowerCase().includes(q) ||
      roleText(c).toLowerCase().includes(q),
  );
  const current = shown.find((c) => c.id === picked) ?? shown[0];
  const empty = !loading && rows.length === 0;
  const add = (
    <Button onClick={onAdd}>
      <Icon name="plus" /> {t('contacts.add')}
    </Button>
  );
  return (
    <>
      <PageHeader
        title={t('contacts.title')}
        lede={t('contacts.lede')}
        {...(canCreate && !empty ? { actions: add } : {})}
      />
      {empty || loading ? (
        <div className="two" data-layout="single">
          <Card data-area="empty">
            {empty ? (
              <EmptyState icon="vet" action={canCreate ? add : undefined}>
                {t('empty.contacts')}
              </EmptyState>
            ) : (
              <EmptyState busy>{t('ui.loading')}</EmptyState>
            )}
          </Card>
        </div>
      ) : (
        <div className="two" data-layout="contacts">
          <Card data-area="list">
            <SectionHeader title={t('contacts.list')} />
            <input
              type="search"
              className="csearch"
              aria-label={t('contacts.search')}
              placeholder={t('contacts.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {shown.length === 0 ? <p className="muted">{t('contacts.noMatch')}</p> : null}
            <ul aria-label={t('contacts.list')}>
              {shown.map((c) => {
                const name = String(c.data.name);
                const phone = field(c, 'phone');
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="crow"
                      data-testid="contact-row"
                      aria-current={c.id === current?.id ? 'true' : undefined}
                      onClick={() => setPicked(c.id)}
                    >
                      <Initials name={name} seed={c.id} />
                      <span className="l">
                        <b>{name}</b>
                        <span>{[roleText(c), phone].filter(Boolean).join(' · ')}</span>
                      </span>
                      {phone ? <Icon name="phone" /> : null}
                      {field(c, 'email') ? <Icon name="mail" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
          {current ? (
            <ContactDetail
              key={current.id}
              c={current}
              canDelete={canDelete(current.createdBy)}
              onDelete={() => onRemove(current, String(current.data.name))}
            />
          ) : (
            <Card data-area="detail">
              <SectionHeader title={t('contacts.title')} />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

/** Vets, clinics, groomers and sitters the household calls (CAP-15). */
export function ContactsPage() {
  const { contacts } = useServices();
  const householdId = useHouseholdId();
  const canCreate = useCan('create', 'contact');
  const canDelete = useCanDelete('contact');
  const removeRecord = useRemoval();
  const wide = useWideScreen();
  const [adding, setAdding] = useState(false);
  const list = useQuery({
    queryKey: ['contact', householdId],
    queryFn: () => contacts.list(householdId),
    enabled: householdId !== '',
  });
  const rows = list.data ?? [];
  const sheet = canCreate ? (
    <Sheet open={adding} label={t('contacts.add')} onClose={() => setAdding(false)}>
      <AddContactForm onClose={() => setAdding(false)} />
    </Sheet>
  ) : null;

  if (wide) {
    return (
      <>
        {list.isError ? <LoadError onRetry={() => void list.refetch()} /> : null}
        <ContactsDesktop
          rows={rows}
          loading={list.isPending}
          canCreate={canCreate}
          canDelete={canDelete}
          onAdd={() => setAdding(true)}
          onRemove={(c, name) => void removeRecord(c, name)}
        />
        {sheet}
      </>
    );
  }

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
                          onClick={() => void removeRecord(c, name)}
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
        {sheet}
      </Card>
    </>
  );
}
