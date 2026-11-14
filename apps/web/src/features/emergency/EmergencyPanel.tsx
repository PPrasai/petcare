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
import { formatDate, formatMeasurement } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import {
  Banner,
  Button,
  Card,
  CopyButton,
  EmptyState,
  Icon,
  Line,
  SectionHeader,
  Sheet,
  SheetHead,
  TextField,
} from '../../ui';
import { useHealthList, useToday } from '../health/hooks';
import { LinkQr } from '../shared/LinkQr';
import { PetAvatar } from '../shared/PetAvatar';
import { useDemo } from '../shared/demo';
import { useCan, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function CardSheet({
  card,
  petId,
  onClose,
}: {
  card: StoredRecord | null;
  petId: string;
  onClose: () => void;
}) {
  const { emergency } = useServices();
  const householdId = useHouseholdId();
  const showToast = useToastStore((s) => s.show);
  const [fields, setFields] = useState<EmergencyField[]>(
    (card?.data.visibleFields as EmergencyField[] | undefined) ?? DEFAULT_VISIBLE,
  );
  const [owner, setOwner] = useState(text(card?.data.ownerDisplayName));
  const [phone, setPhone] = useState(text(card?.data.ownerPhone));
  const [notes, setNotes] = useState(text(card?.data.notes));
  const [error, setError] = useState('');

  const toggle = (field: EmergencyField, on: boolean) =>
    setFields((current) => (on ? [...current, field] : current.filter((f) => f !== field)));

  return (
    <>
      <SheetHead title={t('emergency.editTitle')} onClose={onClose} />
      <form
        aria-label={t('emergency.editTitle')}
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
              showToast(t('emergency.saved'));
              onClose();
            })
            .catch((err: unknown) => {
              if (!(err instanceof InvalidInput)) throw err;
              setError(t('form.invalid'));
            });
        }}
      >
        <fieldset className="checks two-col">
          <legend>{t('emergency.shows')}</legend>
          {EMERGENCY_FIELDS.map((field) => (
            <label key={field}>
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
          autoComplete="tel"
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
        <Button type="submit">{t('emergency.save')}</Button>
      </form>
    </>
  );
}

function LostSheet({
  petId,
  petName,
  onClose,
}: {
  petId: string;
  petName: string;
  onClose: () => void;
}) {
  const { emergency } = useServices();
  const householdId = useHouseholdId();
  const showToast = useToastStore((s) => s.show);
  const [message, setMessage] = useState('');
  return (
    <>
      <SheetHead title={t('emergency.markLostNamed', { name: petName })} onClose={onClose} />
      <form
        aria-label={t('emergency.markLostNamed', { name: petName })}
        onSubmit={(e) => {
          e.preventDefault();
          void emergency.markLost(householdId, petId, message).then(() => {
            showToast(t('emergency.lostToast', { name: petName }));
            onClose();
          });
        }}
      >
        <p>{t('emergency.lostSheetBody')}</p>
        <TextField
          label={t('emergency.lostMessage')}
          value={message}
          maxLength={1000}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Button variant="danger" type="submit">
          {t('emergency.markLost')}
        </Button>
      </form>
    </>
  );
}

/** Names of what a finder would be told about: active allergies, conditions and medications. */
function useMedicalTags(petId: string, visible: readonly string[]): string[] {
  const today = useToday();
  const conditions = useHealthList('condition', petId);
  const medications = useHealthList('medication', petId);
  const open = (conditions.data ?? []).filter((c) => !text(c.data.resolvedOn));
  const tags: string[] = [];
  if (visible.includes('allergies')) {
    tags.push(...open.filter((c) => c.data.kind === 'allergy').map((c) => String(c.data.name)));
  }
  if (visible.includes('conditions')) {
    tags.push(...open.filter((c) => c.data.kind !== 'allergy').map((c) => String(c.data.name)));
  }
  if (visible.includes('medications')) {
    tags.push(
      ...(medications.data ?? [])
        .filter((m) => {
          const end = (m.data.schedule as { endOn?: string | null } | null | undefined)?.endOn;
          return !end || end >= today;
        })
        .map((m) => String(m.data.name)),
    );
  }
  return tags;
}

/** The pet's emergency card: what a finder sees, lost mode, and the public link with its QR. */
export function EmergencyPanel({ pet }: { pet: StoredRecord }) {
  const petId = pet.id;
  const petName = String(pet.data.name);
  const { emergency, measurements } = useServices();
  const householdId = useHouseholdId();
  const demo = useDemo();
  const canEdit = useCan('update', 'emergencyCard');
  const prefs = useSessionStore((s) => s.preferences);
  const user = useSessionStore((s) => s.user);
  const showToast = useToastStore((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [losing, setLosing] = useState(false);
  const [link, setLink] = useState<EmergencyLink | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const card = useQuery({
    queryKey: ['emergencyCard', householdId, { petId }],
    queryFn: () => emergency.get(householdId, petId),
    enabled: householdId !== '',
  });
  const weights = useQuery({
    queryKey: ['measurement', householdId, { petId }],
    queryFn: () => measurements.list(householdId, petId),
    enabled: householdId !== '',
  });
  const data = card.data ?? null;
  const visible = (data?.data.visibleFields as string[] | undefined) ?? DEFAULT_VISIBLE;
  const tags = useMedicalTags(petId, visible);
  const lastWeight = (weights.data ?? []).filter((m) => m.data.kind === 'weight').at(-1);
  const lost = data?.data.isLost === true;
  const owner = canEdit;

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

  const print = () => {
    document.body.classList.add('printing-card');
    const done = () => {
      document.body.classList.remove('printing-card');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  const breed = [
    text(pet.data.breed),
    lastWeight ? formatMeasurement('weight', Number(lastWeight.data.value), prefs) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const contactName = text(data?.data.ownerDisplayName) || user?.name || '';
  const phone = text(data?.data.ownerPhone);
  const notes = text(data?.data.notes);
  const editButton = (key: 'emergency.editCard' | 'emergency.setUp') => (
    <button type="button" className="linkbtn" onClick={() => setEditing(true)}>
      {t(key)}
    </button>
  );

  if (card.isPending) {
    return (
      <Card>
        <EmptyState busy>{t('ui.loading')}</EmptyState>
      </Card>
    );
  }

  return (
    <>
      {lost ? (
        <div className="alert" role="status">
          <Icon name="shield" />
          <div>
            <b>{t('emergency.lostAlertTitle')}</b> {t('emergency.lostAlertBody', { name: petName })}
            <br />
            {t('emergency.isLost', { date: formatDate(text(data?.data.lostSince), prefs) })}
          </div>
        </div>
      ) : null}
      <div className="two">
        <div className="stack">
          <Card>
            <div className="emhero">
              <PetAvatar pet={pet} size={96} />
              <div className="l">
                <h2>{petName}</h2>
                {breed ? <span className="muted">{breed}</span> : null}
                <span className="chip-id">
                  {t('emergency.microchip')} {text(pet.data.microchipId) || t('emergency.notAdded')}
                </span>
              </div>
            </div>
            {demo ? <Banner>{t('demo.emergencyDisabled')}</Banner> : null}
            {!owner ? <Banner>{t('emergency.ownerOnly')}</Banner> : null}
            {error ? <Banner tone="warn">{error}</Banner> : null}
            {notice ? <p role="status">{notice}</p> : null}
            <div className="qrrow">
              {link ? (
                <LinkQr link={link.url} label={t('emergency.qr')} />
              ) : (
                <div className="qr empty-qr">
                  <Icon name="shield" />
                  <span>{t('emergency.qrPlaceholder')}</span>
                </div>
              )}
              <div className="l">
                {link ? (
                  <>
                    <code data-testid="emergency-link">{link.url}</code>
                    <div className="acts">
                      <CopyButton
                        value={link.url}
                        label={t('emergency.copy')}
                        copiedToast={t('emergency.copied')}
                        onNotify={showToast}
                      />
                      <Button variant="secondary" onClick={print}>
                        {t('emergency.print')}
                      </Button>
                    </div>
                  </>
                ) : null}
                {owner && data && !demo ? (
                  <div className="acts">
                    <Button
                      variant={link ? 'secondary' : 'primary'}
                      onClick={() =>
                        void run(async () => {
                          setLink(await emergency.createLink(data.id));
                        })
                      }
                    >
                      {link ? t('emergency.newLink') : t('emergency.createLink')}
                    </Button>
                  </div>
                ) : null}
                <p className="muted">{t('emergency.linkHint')}</p>
              </div>
            </div>
            {link ? (
              <div data-print-card aria-hidden="true">
                <h2>{t('emergency.printTitle')}</h2>
                <LinkQr link={link.url} label={t('emergency.qr')} />
                <p>{t('emergency.printHint', { name: petName })}</p>
              </div>
            ) : null}
          </Card>
        </div>
        <div className="stack">
          <Card>
            <SectionHeader
              title={t('emergency.ifFound')}
              {...(owner && data ? { aside: editButton('emergency.editCard') } : {})}
            />
            {!data ? (
              <EmptyState
                {...(owner
                  ? {
                      action: (
                        <Button onClick={() => setEditing(true)}>{t('emergency.setUp')}</Button>
                      ),
                    }
                  : {})}
              >
                {t('emergency.linkNeedsCard')}
              </EmptyState>
            ) : (
              <>
                {phone ? null : (
                  <EmptyState
                    {...(owner
                      ? {
                          action: (
                            <Button variant="secondary" onClick={() => setEditing(true)}>
                              {t('emergency.editCard')}
                            </Button>
                          ),
                        }
                      : {})}
                  >
                    {t('emergency.noContact')}
                  </EmptyState>
                )}
                {phone || notes ? (
                  <ul>
                    {phone ? (
                      <Line
                        title={contactName}
                        sub={t('emergency.ownerRole')}
                        aside={<span>{phone}</span>}
                      />
                    ) : null}
                    {notes ? <Line title={t('emergency.field.notes')} sub={notes} /> : null}
                  </ul>
                ) : null}
              </>
            )}
          </Card>
          <Card>
            <SectionHeader title={t('emergency.medical')} />
            {tags.length > 0 ? (
              <div className="tags">
                {tags.map((name, i) => (
                  <span key={`${name}-${i}`} className="tag">
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <EmptyState>{t('emergency.noMedical')}</EmptyState>
            )}
          </Card>
          {owner ? (
            <div className="acts">
              {lost ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void emergency
                      .markFound(householdId, petId)
                      .then(() => showToast(t('emergency.foundToast', { name: petName })))
                  }
                >
                  {t('emergency.markFound')}
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setLosing(true)}>
                  {t('emergency.markLostNamed', { name: petName })}
                </Button>
              )}
              {data && !demo ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void run(async () => {
                      await emergency.revokeLink(data.id);
                      setLink(null);
                      setNotice(t('emergency.linkRevoked'));
                    })
                  }
                >
                  {t('emergency.revokeLink')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <Sheet open={editing} label={t('emergency.editTitle')} onClose={() => setEditing(false)}>
        <CardSheet card={data} petId={petId} onClose={() => setEditing(false)} />
      </Sheet>
      <Sheet
        open={losing}
        label={t('emergency.markLostNamed', { name: petName })}
        onClose={() => setLosing(false)}
      >
        <LostSheet petId={petId} petName={petName} onClose={() => setLosing(false)} />
      </Sheet>
    </>
  );
}
