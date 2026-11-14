import type { StoredRecord } from '../../application/ports/record-store';
import { ConditionsPanel, SymptomsPanel } from '../health/ConditionsPanel';
import { MedicationsPanel } from '../health/MedicationsPanel';
import { VaccinationsPanel } from '../health/VaccinationsPanel';
import { VisitsPanel } from '../health/VisitsPanel';
import { MeasurementsPanel } from './MeasurementsPanel';

/** Health (mock 03): vaccinations, medications and conditions, then visits, measurements, symptoms. */
export function HealthPane({ pet }: { pet: StoredRecord }) {
  return (
    <div className="two">
      <div className="stack">
        <VaccinationsPanel petId={pet.id} species={String(pet.data.species)} />
        <MedicationsPanel petId={pet.id} />
        <ConditionsPanel petId={pet.id} />
      </div>
      <div className="stack">
        <VisitsPanel petId={pet.id} />
        <MeasurementsPanel petId={pet.id} />
        <SymptomsPanel petId={pet.id} />
      </div>
    </div>
  );
}
