import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import { Card, Chip, EmptyState, PageHeader } from '../../ui';
import { PetAvatar } from '../shared/PetAvatar';
import { useWideScreen } from '../shared/use-wide-screen';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { EmergencyPanel } from './EmergencyPanel';

/** Every pet's emergency card in one place (CAP-11). `?pet=` picks the pet shown. */
export function EmergencyPage({ petId }: { petId?: string | undefined }) {
  const { pets } = useServices();
  const householdId = useHouseholdId();
  const navigate = useNavigate();
  const wide = useWideScreen();
  const list = useQuery({
    queryKey: ['pet', householdId],
    queryFn: () => pets.list(householdId),
    enabled: householdId !== '',
  });
  const choices = (list.data ?? []).filter((p) => !p.data.archivedAt);
  const pet = choices.find((p) => p.id === petId) ?? choices[0];

  const chips =
    choices.length > 1 ? (
      <div className="tags" role="group" aria-label={t('emergency.pickPet')}>
        {choices.map((p) => (
          <Chip
            key={p.id}
            className="pchip"
            pressed={p.id === pet?.id}
            onClick={() =>
              void navigate({
                to: '/emergency',
                search: { pet: p.id },
                replace: true,
                resetScroll: false,
              })
            }
          >
            <PetAvatar pet={p} size={26} />
            {String(p.data.name)}
          </Chip>
        ))}
      </div>
    ) : null;
  const none =
    list.isSuccess && choices.length === 0 ? <EmptyState>{t('pets.empty')}</EmptyState> : null;

  return (
    <>
      <PageHeader
        title={t('emergency.title')}
        lede={t('emergency.lede')}
        {...(wide && chips ? { actions: chips } : {})}
      />
      {wide && none ? (
        <div className="two" data-layout="single">
          <Card data-area="empty">{none}</Card>
        </div>
      ) : (
        none
      )}
      {wide ? null : chips}
      {pet ? <EmergencyPanel key={pet.id} pet={pet} /> : null}
    </>
  );
}
