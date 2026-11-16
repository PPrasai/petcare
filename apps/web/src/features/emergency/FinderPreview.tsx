import type { StoredRecord } from '../../application/ports/record-store';
import type { MessageKey } from '../../i18n/en';
import { t } from '../../i18n/t';
import { PetAvatar } from '../shared/PetAvatar';

const FACTS = ['colour', 'markings', 'microchipId'] as const;
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** A read-only preview of the public page, built from the fields the card has switched on. */
export function FinderPreview({
  pet,
  card,
}: {
  pet: StoredRecord;
  card: StoredRecord['data'] | undefined;
}) {
  const visible = (card?.visibleFields as string[] | undefined) ?? [];
  const on = (field: string) => visible.includes(field);
  const subtitle = [
    on('breed') && text(pet.data.breed),
    on('species') && t(`pets.species.${text(pet.data.species)}` as MessageKey),
  ]
    .filter(Boolean)
    .join(' · ');
  const contact = [
    on('ownerDisplayName') && text(card?.ownerDisplayName),
    on('ownerPhone') && text(card?.ownerPhone),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="preview">
      {card?.isLost === true ? (
        <div className="alert">
          <b>{t('public.lost')}</b>
        </div>
      ) : null}
      <div className="who">
        <PetAvatar pet={pet} size={44} />
        <div>
          <b>{on('name') ? String(pet.data.name) : t('public.title')}</b>
          <div className="muted">{subtitle}</div>
        </div>
      </div>
      <dl className="facts">
        {FACTS.filter((key) => on(key) && text(pet.data[key])).map((key) => (
          <div key={key}>
            <dt className="label">{t(`public.${key}` as MessageKey)}</dt>
            <dd>{text(pet.data[key])}</dd>
          </div>
        ))}
      </dl>
      {contact ? (
        <div>
          <span className="label">{t('public.ifFound')}</span>
          <div>{contact}</div>
        </div>
      ) : null}
    </div>
  );
}
