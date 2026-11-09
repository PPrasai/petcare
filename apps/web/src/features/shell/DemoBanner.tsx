import { useNavigate } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import { Button } from '../../ui';
import { useServices } from '../shared/services-context';

/** Always visible in the demo: it is not real, and it can be reset or left (CAP-03). */
export function DemoBanner() {
  const { session } = useServices();
  const navigate = useNavigate();
  return (
    <div role="region" aria-label={t('demo.region')} className="demo print:hidden">
      <p style={{ fontWeight: 800 }}>{t('demo.banner')}</p>
      <div className="acts">
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
