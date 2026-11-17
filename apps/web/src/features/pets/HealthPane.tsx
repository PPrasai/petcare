import type { StoredRecord } from '../../application/ports/record-store';
import { ConditionsPanel, SymptomsPanel } from '../health/ConditionsPanel';
import { RecentActivity } from '../health/RecentActivity';
import { MedicationsPanel } from '../health/MedicationsPanel';
import { VaccinationsPanel } from '../health/VaccinationsPanel';
import { VisitsPanel } from '../health/VisitsPanel';
import { Flow } from '../shared/Flow';
import type { FlowPlan } from '../shared/Flow';
import { MeasurementsPanel } from './MeasurementsPanel';

/** Columns by reading order; each stacks its own panels, so no panel waits for a neighbour's height. */
const PLAN: FlowPlan = {
  wide: [
    [1, 'vax', 'cond'],
    [1, 'meds', 'sym'],
    [1, 'visits', 'meas'],
    [1.1, 'act'],
  ],
  mid: [
    [1, 'vax', 'cond', 'sym'],
    [1, 'meds', 'visits', 'meas'],
    [1, 'act'],
  ],
};

/** Health (mock 03): vaccinations, medications and conditions; then recent activity, visits, measurements, symptoms. */
export function HealthPane({ pet }: { pet: StoredRecord }) {
  const panels = {
    vax: <VaccinationsPanel petId={pet.id} species={String(pet.data.species)} />,
    meds: <MedicationsPanel petId={pet.id} />,
    cond: <ConditionsPanel petId={pet.id} />,
    act: <RecentActivity petId={pet.id} />,
    visits: <VisitsPanel petId={pet.id} />,
    meas: <MeasurementsPanel petId={pet.id} />,
    sym: <SymptomsPanel petId={pet.id} />,
  };
  return (
    <Flow layout="health" panels={panels} plan={PLAN}>
      <div className="stack">
        {panels.vax}
        {panels.meds}
        {panels.cond}
      </div>
      <div className="stack">
        {panels.act}
        {panels.visits}
        {panels.meas}
        {panels.sym}
      </div>
    </Flow>
  );
}
