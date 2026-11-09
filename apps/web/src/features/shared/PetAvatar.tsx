import { useQuery } from '@tanstack/react-query';
import { t } from '../../i18n/t';
import { Avatar } from '../../ui';
import { useServices } from './services-context';

interface PetAvatarProps {
  pet: { id: string; data: Record<string, unknown> };
  size: number;
  dot?: 'overdue' | 'today' | 'soon' | 'ok';
}

/** A pet's photo when it has one on this device or on the server, else its species illustration. */
export function PetAvatar({ pet, size, dot }: PetAvatarProps) {
  const { files } = useServices();
  const fileId = typeof pet.data.photoFileId === 'string' ? pet.data.photoFileId : '';
  const photo = useQuery({
    queryKey: ['file', fileId],
    queryFn: async () => (await files.open(fileId))?.url ?? null,
    enabled: fileId !== '',
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });
  const name = String(pet.data.name ?? '');
  return (
    <Avatar
      petId={pet.id}
      species={String(pet.data.species ?? 'other')}
      size={size}
      photoUrl={photo.data ?? null}
      photoAlt={t('pet.photoAlt', { name })}
      {...(dot ? { dot } : {})}
    />
  );
}
