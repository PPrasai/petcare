import { useQuery } from '@tanstack/react-query';
import { t } from '../../i18n/t';
import { EmptyState, Icon, Line } from '../../ui';
import { useLogSheet } from '../log/log-sheet';
import { amountText } from '../log/quantity';
import { useCanDelete, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

/** The Feeding disclosure's presets: the usual meals of one pet, removable, and a way to log one. */
export function MealPresets({ petId, petName }: { petId: string; petName: string }) {
  const { log } = useServices();
  const householdId = useHouseholdId();
  const canDelete = useCanDelete('mealPreset');
  const sheet = useLogSheet();
  const presets = useQuery({
    queryKey: ['mealPreset', householdId, { petId }],
    queryFn: () => log.presets(householdId, petId),
    enabled: householdId !== '',
  });
  const rows = presets.data ?? [];

  return (
    <>
      {presets.data && rows.length === 0 ? <EmptyState>{t('feeding.empty')}</EmptyState> : null}
      {rows.length > 0 ? (
        <ul aria-label={t('feeding.presetsLabel')}>
          {rows.map((p) => {
            const food = String(p.data.foodName);
            return (
              <Line
                key={p.id}
                testId="meal-preset-row"
                title={food}
                sub={amountText(Number(p.data.quantity), String(p.data.quantityUnit))}
                actions={
                  canDelete(p.createdBy) ? (
                    <button
                      type="button"
                      className="linkbtn"
                      aria-label={t('feeding.removeLabel', { food })}
                      onClick={() => void log.removePreset(p.id)}
                    >
                      {t('feeding.remove')}
                    </button>
                  ) : null
                }
              />
            );
          })}
        </ul>
      ) : null}
      <button
        type="button"
        className="linkbtn"
        aria-label={t('feeding.logMealLabel', { name: petName })}
        onClick={() => sheet.open({ petId, kind: 'meal' })}
      >
        <Icon name="plus" /> {t('feeding.logMeal')}
      </button>
    </>
  );
}
