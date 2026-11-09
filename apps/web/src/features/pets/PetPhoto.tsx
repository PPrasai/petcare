import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { PhotoUnusable } from '../../application/ports/image-reducer';
import type { StoredRecord } from '../../application/ports/record-store';
import { t } from '../../i18n/t';
import { Icon } from '../../ui';
import { useCan, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { useToastStore } from '../shared/toast';

/**
 * A pet's photo controls (CAP-22): a hidden file input, a camera badge for the avatar and an
 * "Add a photo" button. Viewers get none of them. The picture is reduced on the device and kept
 * for upload, so it shows at once, offline or not.
 */
export function usePetPhoto(pet: StoredRecord | undefined) {
  const { photos } = useServices();
  const householdId = useHouseholdId();
  const canEdit = useCan('update', 'pet', ['photoFileId']);
  const show = useToastStore((s) => s.show);
  const input = useRef<HTMLInputElement>(null);
  const name = String(pet?.data.name ?? '');
  const hasPhoto = typeof pet?.data.photoFileId === 'string' && pet.data.photoFileId !== '';
  const editable = canEdit && pet !== undefined && pet.data.archivedAt == null;

  const pick = () => input.current?.click();
  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !pet) return;
    try {
      await photos.set(householdId, pet.id, file);
      show(t('photo.saved', { name }));
    } catch (error) {
      show(t(error instanceof PhotoUnusable ? 'photo.unusable' : 'photo.failed'));
    }
  };
  const remove = async () => {
    if (!pet) return;
    try {
      await photos.remove(pet.id);
      show(t('photo.removed', { name }));
    } catch {
      show(t('photo.failed'));
    }
  };

  const fileInput = editable ? (
    <input
      ref={input}
      type="file"
      accept="image/*"
      hidden
      data-testid="pet-photo-input"
      onChange={(event) => void onChange(event)}
    />
  ) : null;

  const badge = editable ? (
    <span className="camslot">
      {hasPhoto ? (
        <details className="moremenu">
          <summary className="camb" aria-label={t('photo.change', { name })}>
            <Icon name="camera" />
          </summary>
          <div className="menu">
            <button
              type="button"
              onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open');
                pick();
              }}
            >
              {t('photo.choose')}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.currentTarget.closest('details')?.removeAttribute('open');
                void remove();
              }}
            >
              {t('photo.remove')}
            </button>
          </div>
        </details>
      ) : (
        <button
          type="button"
          className="camb"
          aria-label={t('photo.change', { name })}
          onClick={pick}
        >
          <Icon name="camera" />
        </button>
      )}
    </span>
  ) : null;

  const addButton =
    editable && !hasPhoto ? (
      <button type="button" className="btn" onClick={pick}>
        <Icon name="camera" /> {t('photo.add')}
      </button>
    ) : null;

  return { fileInput, badge, addButton };
}
