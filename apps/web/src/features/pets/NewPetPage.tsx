import { useNavigate } from '@tanstack/react-router';
import { emptyPetForm } from '../../application/pet-form';
import { t } from '../../i18n/t';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { PetForm } from './PetForm';

export function NewPetPage() {
  const { pets } = useServices();
  const householdId = useHouseholdId();
  const navigate = useNavigate();
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('pets.new.title')}</h1>
      <PetForm
        initial={emptyPetForm}
        submitLabel={t('petForm.save')}
        onCancel={() => void navigate({ to: '/pets' })}
        onSubmit={async (values) => {
          const pet = await pets.create(householdId, values);
          await navigate({
            to: '/pets/$petId',
            params: { petId: pet.id },
            search: { tab: 'overview' },
          });
        }}
      />
    </div>
  );
}
