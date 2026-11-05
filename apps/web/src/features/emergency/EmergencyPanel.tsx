import { useQuery } from '@tanstack/react-query';
import { EMERGENCY_FIELDS } from '@petcare/domain';
import { useState } from 'react';
import { DEFAULT_VISIBLE } from '../../application/emergency-service';
import type { EmergencyField } from '../../application/emergency-service';
import { EmergencyError } from '../../application/ports/emergency-api';
import type { EmergencyLink } from '../../application/ports/emergency-api';
import type { StoredRecord } from '../../application/ports/record-store';
import { InvalidInput } from '../../application/pet-service';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Banner, Button, TextField } from '../../ui';
import { useDemo } from '../shared/demo';
import { useCan, useHouseholdId } from '../shared/permissions';
import { LinkQr } from '../shared/LinkQr';
import { useServices } from '../shared/services-context';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function CardForm({ card, petId }: { card: StoredRecord | null; petId: string }) {
  const { emergency } = useServices();
  const householdId = useHouseholdId();
  const [fields, setFields] = useState<EmergencyField[]>(
    (card?.data.visibleFields as EmergencyField[] | undefined) ?? DEFAULT_VISIBLE,
  );
  const [owner, setOwner] = useState(text(card?.data.ownerDisplayName));
  const [phone, setPhone] = useState(text(card?.data.ownerPhone));
  const [notes, setNotes] = useState(text(card?.data.notes));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const toggle = (field: EmergencyField, on: boolean) => {
    setSaved(false);
    setFields((current) => (on ? [...current, field] : current.filter((f) => f !== field)));
  };

  return (
    <form
      aria-label={t('emergency.title')}
      className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3 print:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        void emergency
          .save(householdId, petId, {
            visibleFields: fields,
            ownerDisplayName: owner,
            ownerPhone: phone,
            notes,
          })
          .then(() => {
            setSaved(true);
            setError('');
          })
          .catch((err: unknown) => {
            if (!(err instanceof InvalidInput)) throw err;
            setError(t('form.invalid'));
          });
      }}
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">{t('emergency.shows')}</legend>
        {EMERGENCY_FIELDS.map((field) => (
          <label key={field} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={fields.includes(field)}
              onChange={(e) => toggle(field, e.target.checked)}
            />
            {t(`emergency.field.${field}` as MessageKey)}
          </label>
        ))}
      </fieldset>
      <TextField
        label={t('emergency.ownerName')}
        value={owner}
        maxLength={100}
        onChange={(e) => setOwner(e.target.value)}
      />
      <TextField
        label={t('emergency.ownerPhone')}
        type="tel"
        value={phone}
        maxLength={40}
        onChange={(e) => setPhone(e.target.value)}
      />
      <TextField
        label={t('emergency.notes')}
        value={notes}
        maxLength={1000}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error ? <Banner tone="warn">{error}</Banner> : null}
      <div className="flex items-center gap-3">
        <Button type="submit">{t('emergency.save')}</Button>
        {saved ? <span role="status">{t('emergency.saved')}</span> : null}
      </div>
    </form>
  );
}

function LostMode({ card, petId }: { card: StoredRecord | null; petId: string }) {
  const { emergency } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const [message, setMessage] = useState('');
  const lost = card?.data.isLost === true;
  return (
    <section
      aria-labelledby="lost-title"
      className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3 print:hidden"
    >
      <h3 id="lost-title" className="text-lg font-semibold">
        {t('emergency.lostTitle')}
      </h3>
      {lost ? (
        <>
          <Banner tone="warn">
            {t('emergency.isLost', { date: formatDate(text(card?.data.lostSince), prefs) })}
          </Banner>
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => void emergency.markFound(householdId, petId)}
          >
            {t('emergency.markFound')}
          </Button>
        </>
      ) : (
        <>
          <p>{t('emergency.lostBody')}</p>
          <TextField
            label={t('emergency.lostMessage')}
            value={message}
            maxLength={1000}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button
            className="self-start"
            onClick={() => void emergency.markLost(householdId, petId, message)}
          >
            {t('emergency.markLost')}
          </Button>
        </>
      )}
    </section>
  );
}

function LinkSection({ card, petName }: { card: StoredRecord | null; petName: string }) {
  const { emergency } = useServices();
  const demo = useDemo();
  const [link, setLink] = useState<EmergencyLink | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const run = async (work: () => Promise<void>) => {
    setError('');
    setNotice('');
    try {
      await work();
    } catch (err) {
      if (!(err instanceof EmergencyError)) throw err;
      setError(t(`emergency.error.${err.kind}` as MessageKey));
    }
  };

  return (
    <section aria-labelledby="link-title" className="flex flex-col gap-2">
      <h3 id="link-title" className="text-lg font-semibold print:hidden">
        {t('emergency.linkTitle')}
      </h3>
      {demo ? <Banner>{t('demo.emergencyDisabled')}</Banner> : null}
      {!card && !demo ? <Banner>{t('emergency.linkNeedsCard')}</Banner> : null}
      {card && !demo ? (
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            onClick={() =>
              void run(async () => {
                setLink(await emergency.createLink(card.id));
              })
            }
          >
            {link ? t('emergency.newLink') : t('emergency.createLink')}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              void run(async () => {
                await emergency.revokeLink(card.id);
                setLink(null);
                setNotice(t('emergency.linkRevoked'));
              })
            }
          >
            {t('emergency.revokeLink')}
          </Button>
        </div>
      ) : null}
      <p className="text-sm print:hidden">{t('emergency.linkHint')}</p>
      {error ? <Banner tone="warn">{error}</Banner> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {link ? (
        <div
          role="region"
          aria-label={t('emergency.printTitle')}
          className="flex flex-col items-center gap-2 rounded-lg border border-line bg-white p-4 text-center text-black"
        >
          <p className="text-xl font-semibold">{t('emergency.printTitle')}</p>
          <LinkQr link={link.url} label={t('emergency.qr')} className="h-56 w-56" />
          <p>{t('emergency.printHint', { name: petName })}</p>
          <p className="break-all text-xs print:hidden">
            {t('emergency.link')}: <code data-testid="emergency-link">{link.url}</code>
          </p>
          <Button className="print:hidden" onClick={() => window.print()}>
            {t('emergency.print')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** The pet's emergency card: what a finder sees, lost mode, and the public link with its QR. */
export function EmergencyPanel({ petId, petName }: { petId: string; petName: string }) {
  const { emergency } = useServices();
  const householdId = useHouseholdId();
  const canEdit = useCan('update', 'emergencyCard');
  const card = useQuery({
    queryKey: ['emergencyCard', householdId, { petId }],
    queryFn: () => emergency.get(householdId, petId),
    enabled: householdId !== '',
  });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="emergency-title">
      <h2 id="emergency-title" className="text-xl font-semibold print:hidden">
        {t('emergency.title')}
      </h2>
      <p className="print:hidden">{t('emergency.intro')}</p>
      {!canEdit ? <Banner>{t('emergency.ownerOnly')}</Banner> : null}
      {canEdit && card.isSuccess ? (
        <>
          <CardForm card={card.data} petId={petId} />
          <LostMode key={`lost-${card.data?.version ?? 'new'}`} card={card.data} petId={petId} />
          <LinkSection card={card.data} petName={petName} />
        </>
      ) : null}
    </section>
  );
}
