import { useState } from 'react';
import { ARCHIVE_REASONS } from '../../application/pet-form';
import type { ArchiveReason } from '../../application/pet-form';
import type { StoredRecord } from '../../application/ports/record-store';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { formatDate } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Banner, Button, Dialog, SelectField, Sheet, SheetHead } from '../../ui';
import { useCan } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';
import { PetForm } from './PetForm';

function Fact({ label, children }: { label: string; children: string }) {
  if (!children) return null;
  return (
    <div>
      <span className="label">{label}</span>
      <b>{children}</b>
    </div>
  );
}

/** Profile details with edit (a sheet) and archive (a dialog). */
export function PetOverview({ pet }: { pet: StoredRecord }) {
  const { pets } = useServices();
  const prefs = useSessionStore((s) => s.preferences);
  const show = useToastStore((s) => s.show);
  const canEdit = useCan('update', 'pet');
  const canArchive = useCan('update', 'pet', ['archivedAt']);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState<ArchiveReason>('other');
  const d = pet.data;
  const name = String(d.name);
  const text = (key: string) => (typeof d[key] === 'string' ? (d[key] as string) : '');
  const date = (key: string) => (text(key) ? formatDate(text(key), prefs) : '');
  const archived = Boolean(d.archivedAt);
  const insurance = (d.insurance ?? {}) as Record<string, string | undefined>;
  const species =
    d.species === 'other' && text('speciesOther')
      ? text('speciesOther')
      : t(`pets.species.${text('species')}` as MessageKey);
  const breed = [text('breed'), d.isMixedBreed === true ? t('petForm.mixed') : '']
    .filter(Boolean)
    .join(' · ');
  const sex = text('sex') ? t(`petForm.sex.${text('sex')}` as MessageKey) : '';
  const born = date('birthDate')
    ? `${date('birthDate')}${d.birthDateEstimated === true ? ` ${t('pet.field.estimated')}` : ''}`
    : '';
  const neutered =
    d.neutered === true
      ? t('petForm.neutered.yes')
      : d.neutered === false
        ? t('petForm.neutered.no')
        : '';
  const insured = [
    insurance.provider,
    insurance.policyNumber,
    insurance.renewsOn ? formatDate(insurance.renewsOn, prefs) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const size = text('sizeCategory') ? t(`petForm.size.${text('sizeCategory')}` as MessageKey) : '';
  const shown = [
    species,
    breed,
    sex,
    born,
    date('adoptedOn'),
    neutered,
    text('colour'),
    text('markings'),
    text('microchipId'),
    insured,
    text('diet'),
    text('bloodType'),
    size,
  ].some(Boolean);

  return (
    <>
      {archived ? (
        <Banner tone="warn">
          {t('pet.archivedBanner')}
          {canArchive ? (
            <>
              {' '}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void pets.archive(pet.id, null);
                  show(t('pet.restored', { name }));
                }}
              >
                {t('pet.restore')}
              </button>
            </>
          ) : null}
        </Banner>
      ) : null}
      {!canEdit ? <Banner>{t('pet.readOnly')}</Banner> : null}
      {shown ? (
        <div className="facts">
          <Fact label={t('pet.field.species')}>{species}</Fact>
          <Fact label={t('pet.field.breed')}>{breed}</Fact>
          <Fact label={t('pet.field.sex')}>{sex}</Fact>
          <Fact label={t('pet.field.born')}>{born}</Fact>
          <Fact label={t('pet.field.adopted')}>{date('adoptedOn')}</Fact>
          <Fact label={t('pet.field.neutered')}>{neutered}</Fact>
          <Fact label={t('pet.field.colour')}>{text('colour')}</Fact>
          <Fact label={t('pet.field.markings')}>{text('markings')}</Fact>
          <Fact label={t('pet.field.microchip')}>{text('microchipId')}</Fact>
          <Fact label={t('pet.field.insurance')}>{insured}</Fact>
          <Fact label={t('pet.field.diet')}>{text('diet')}</Fact>
          <Fact label={t('pet.field.bloodType')}>{text('bloodType')}</Fact>
          <Fact label={t('pet.field.size')}>{size}</Fact>
        </div>
      ) : (
        <p className="empty">{t('pet.noDetails')}</p>
      )}
      {canEdit || (canArchive && !archived) ? (
        <div className="acts">
          {canEdit ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('pet.editDetails')}
            </Button>
          ) : null}
          {canArchive && !archived ? (
            <Button variant="secondary" onClick={() => setArchiving(true)}>
              {t('pet.archive')}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Sheet open={editing} label={t('pet.editTitle', { name })} onClose={() => setEditing(false)}>
        <SheetHead title={t('pet.editTitle', { name })} onClose={() => setEditing(false)} />
        <PetForm
          initial={pets.formValues(pet)}
          submitLabel={t('petForm.saveChanges')}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await pets.update(pet.id, values);
            show(t('pet.saved', { name: values.name.trim() || name }));
            setEditing(false);
          }}
        />
      </Sheet>
      <Dialog
        open={archiving}
        title={t('pet.archiveTitle', { name })}
        onClose={() => setArchiving(false)}
      >
        <p>{t('pet.archiveBody')}</p>
        <SelectField
          label={t('pet.archiveReason')}
          value={reason}
          onChange={(e) => setReason(e.target.value as ArchiveReason)}
          options={ARCHIVE_REASONS.map((r) => ({
            value: r,
            label: t(`pet.archiveReason.${r}` as MessageKey),
          }))}
        />
        <div className="acts">
          <Button
            variant="danger"
            onClick={() => {
              void pets.archive(pet.id, reason);
              setArchiving(false);
            }}
          >
            {t('pet.archiveConfirm')}
          </Button>
          <Button variant="secondary" onClick={() => setArchiving(false)}>
            {t('ui.cancel')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
