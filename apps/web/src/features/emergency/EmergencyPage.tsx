import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import { Card, Chip } from '../../ui';
import { PetAvatar } from '../shared/PetAvatar';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { EmergencyPanel } from './EmergencyPanel';

/** Every pet's emergency card in one place (CAP-11). `?pet=` picks the pet shown. */
export function EmergencyPage({ petId }: { petId?: string | undefined }) {
  const { pets } = useServices();
  const householdId = useHouseholdId();
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ['pet', householdId],
    queryFn: () => pets.list(householdId),
    enabled: householdId !== '',
  });
  const choices = (list.data ?? []).filter((p) => !p.data.archivedAt);
  const pet = choices.find((p) => p.id === petId) ?? choices[0];

  return (
    <>
      <div className="greet">
        <h1>{t('emergency.title')}</h1>
        <p className="lede">{t('emergency.lede')}</p>
      </div>
      {list.isSuccess && choices.length === 0 ? <p className="empty">{t('pets.empty')}</p> : null}
      {choices.length > 1 ? (
        <div className="tags" role="group" aria-label={t('emergency.pickPet')}>
          {choices.map((p) => (
            <Chip
              key={p.id}
              className="pchip"
              pressed={p.id === pet?.id}
              onClick={() =>
                void navigate({ to: '/emergency', search: { pet: p.id }, replace: true })
              }
            >
              <PetAvatar pet={p} size={26} />
              {String(p.data.name)}
            </Chip>
          ))}
        </div>
      ) : null}
      {pet ? (
        <Card>
          <EmergencyPanel key={pet.id} petId={pet.id} petName={String(pet.data.name)} />
        </Card>
      ) : null}
    </>
  );
}
