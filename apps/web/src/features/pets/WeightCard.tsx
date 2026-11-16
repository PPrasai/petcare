import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { t } from '../../i18n/t';
import { formatDate, toDisplay } from '../../lib/format';
import { useSessionStore } from '../../state/session';
import { Card } from '../../ui';
import { useWideScreen } from '../shared/use-wide-screen';
import { useLogSheet } from '../log/log-sheet';
import { useCan, useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';

const WeightChart = lazy(() => import('./WeightChart'));

/** The weight trend on the overview, with a shortcut to log a new weight. */
export function WeightCard({ petId }: { petId: string }) {
  const { measurements } = useServices();
  const householdId = useHouseholdId();
  const prefs = useSessionStore((s) => s.preferences);
  const canLog = useCan('create', 'measurement');
  const logSheet = useLogSheet();
  const wide = useWideScreen();
  const list = useQuery({
    queryKey: ['measurement', householdId, { petId }],
    queryFn: () => measurements.list(householdId, petId),
    enabled: householdId !== '',
  });
  const weights = (list.data ?? [])
    .filter((m) => m.data.kind === 'weight')
    .map((m) => ({
      date: formatDate(String(m.data.measuredAt), prefs),
      value: Math.round(toDisplay('weight', Number(m.data.value), prefs) * 100) / 100,
    }));
  const last = weights.at(-1);
  const change = Math.round(((last?.value ?? 0) - (weights[0]?.value ?? 0)) * 100) / 100;

  return (
    <Card data-area="weight">
      <div className="sech">
        <h2>{t('weight.title')}</h2>
        {canLog ? (
          <button
            type="button"
            className="linkbtn"
            onClick={() => logSheet.open({ petId, kind: 'weight' })}
          >
            {t('weight.log')}
          </button>
        ) : null}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        {t('weight.unit', { unit: prefs.weightUnit })}
      </p>
      {weights.length >= 2 ? (
        <>
          <div
            role="img"
            aria-label={t('measure.chartSummary', {
              from: weights[0]?.date ?? '',
              to: last?.date ?? '',
              count: weights.length,
            })}
          >
            <Suspense fallback={null}>
              <WeightChart points={weights} unit={prefs.weightUnit} height={wide ? '100%' : 240} />
            </Suspense>
          </div>
          {wide ? (
            <div className="facts">
              <div>
                <span className="label">{t('weight.now')}</span>
                <b>{`${last?.value ?? ''} ${prefs.weightUnit}`}</b>
              </div>
              <div>
                <span className="label">{t('weight.change')}</span>
                <b>{`${change > 0 ? '+' : ''}${change} ${prefs.weightUnit}`}</b>
              </div>
              <div>
                <span className="label">{t('weight.lastWeighed')}</span>
                <b>{last?.date}</b>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="empty">
          {last
            ? t('weight.emptyOne', { value: last.value, unit: prefs.weightUnit })
            : t('weight.empty')}
        </p>
      )}
    </Card>
  );
}
