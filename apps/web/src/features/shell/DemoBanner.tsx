import { useNavigate } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import { Button } from '../../ui';
import { useServices } from '../shared/services-context';

/** Always visible in the demo: it is not real, and it can be reset or left (CAP-03). */
export function DemoBanner() {
  const { session } = useServices();
  const navigate = useNavigate();
  return (
    <div
      role="region"
      aria-label={t('demo.region')}
      className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-warn-bg text-warn px-4 py-2 print:hidden"
    >
      <p className="font-semibold">{t('demo.banner')}</p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => void session.resetDemo()}>
          {t('demo.reset')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void session.exitDemo().then(() => navigate({ to: '/sign-in' }))}
        >
          {t('demo.exit')}
        </Button>
      </div>
    </div>
  );
}
