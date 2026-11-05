import { useState } from 'react';
import { ARCHIVE_REASONS } from '../../application/pet-form';
import type { ArchiveReason } from '../../application/pet-form';
import type { StoredRecord } from '../../application/ports/record-store';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Banner, Button, Dialog, SelectField } from '../../ui';
import { useCan } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { PetForm } from './PetForm';

function Detail({ label, children }: { label: string; children: string }) {
  if (!children) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-40 shrink-0 text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Profile details with edit and archive. */
export function PetOverview({ pet }: { pet: StoredRecord }) {
  const { pets } = useServices();
  const prefs = useSessionStore((s) => s.preferences);
  const canEdit = useCan('update', 'pet');
  const canArchive = useCan('update', 'pet', ['archivedAt']);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState<ArchiveReason>('other');
  const d = pet.data;
  const text = (key: string) => (typeof d[key] === 'string' ? (d[key] as string) : '');
  const date = (key: string) => (text(key) ? formatDate(text(key), prefs) : '');
  const archived = Boolean(d.archivedAt);
  const insurance = (d.insurance ?? {}) as Record<string, string | undefined>;
  const species =
    d.species === 'other' && text('speciesOther')
      ? text('speciesOther')
      : t(`pets.species.${text('species')}` as MessageKey);

  if (editing) {
    return (
      <PetForm
        initial={pets.formValues(pet)}
        submitLabel={t('petForm.saveChanges')}
        onCancel={() => setEditing(false)}
        onSubmit={async (values) => {
          await pets.update(pet.id, values);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {archived ? <Banner tone="warn">{t('pet.archivedBanner')}</Banner> : null}
      {!canEdit ? <Banner>{t('pet.readOnly')}</Banner> : null}
      <dl className="flex flex-col gap-1">
        <Detail label={t('pet.field.species')}>{species}</Detail>
        <Detail label={t('pet.field.breed')}>
          {[text('breed'), d.isMixedBreed === true ? t('petForm.mixed') : '']
            .filter(Boolean)
            .join(' · ')}
        </Detail>
        <Detail label={t('pet.field.sex')}>
          {text('sex') ? t(`petForm.sex.${text('sex')}` as MessageKey) : ''}
        </Detail>
        <Detail label={t('pet.field.neutered')}>
          {d.neutered === true
            ? t('petForm.neutered.yes')
            : d.neutered === false
              ? t('petForm.neutered.no')
              : ''}
        </Detail>
        <Detail label={t('pet.field.born')}>
          {date('birthDate')
            ? `${date('birthDate')}${d.birthDateEstimated === true ? ` ${t('pet.field.estimated')}` : ''}`
            : ''}
        </Detail>
        <Detail label={t('pet.field.adopted')}>{date('adoptedOn')}</Detail>
        <Detail label={t('pet.field.colour')}>{text('colour')}</Detail>
        <Detail label={t('pet.field.markings')}>{text('markings')}</Detail>
        <Detail label={t('pet.field.microchip')}>{text('microchipId')}</Detail>
        <Detail label={t('pet.field.size')}>
          {text('sizeCategory') ? t(`petForm.size.${text('sizeCategory')}` as MessageKey) : ''}
        </Detail>
        <Detail label={t('pet.field.bloodType')}>{text('bloodType')}</Detail>
        <Detail label={t('pet.field.diet')}>{text('diet')}</Detail>
        <Detail label={t('pet.field.insurance')}>
          {[
            insurance.provider,
            insurance.policyNumber,
            insurance.renewsOn ? formatDate(insurance.renewsOn, prefs) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Detail>
      </dl>
      <div className="flex flex-wrap gap-2">
        {canEdit ? <Button onClick={() => setEditing(true)}>{t('pet.edit')}</Button> : null}
        {canArchive && !archived ? (
          <Button variant="secondary" onClick={() => setArchiving(true)}>
            {t('pet.archive')}
          </Button>
        ) : null}
        {canArchive && archived ? (
          <Button variant="secondary" onClick={() => void pets.archive(pet.id, null)}>
            {t('pet.restore')}
          </Button>
        ) : null}
      </div>
      <Dialog open={archiving} title={t('pet.archive')} onClose={() => setArchiving(false)}>
        <div className="flex flex-col gap-3">
          <SelectField
            label={t('pet.archiveReason')}
            value={reason}
            onChange={(e) => setReason(e.target.value as ArchiveReason)}
            options={ARCHIVE_REASONS.map((r) => ({
              value: r,
              label: t(`pet.archiveReason.${r}` as MessageKey),
            }))}
          />
          <Button
            onClick={() => {
              void pets.archive(pet.id, reason);
              setArchiving(false);
            }}
          >
            {t('pet.archiveConfirm')}
          </Button>
          <Button variant="secondary" onClick={() => setArchiving(false)}>
            {t('petForm.cancel')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
