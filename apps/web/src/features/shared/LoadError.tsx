import { t } from '../../i18n/t';
import { Banner, Button } from '../../ui';

/** The warning a failed query shows, with a way to try again (SPEC-petcare-003 P-7). */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Banner tone="warn">
      {t('ui.loadFailed')}{' '}
      <Button variant="secondary" onClick={onRetry}>
        {t('ui.retry')}
      </Button>
    </Banner>
  );
}
