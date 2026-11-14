import { t } from '../i18n/t';
import { Icon } from './icons';

/** The title row of a form sheet: the heading and a close button. */
export function SheetHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="sh-head">
      <h2>{title}</h2>
      <button type="button" className="xbtn" aria-label={t('log.close')} onClick={onClose}>
        <Icon name="x" />
      </button>
    </div>
  );
}
