import { t } from '../../i18n/t';

/** The "Edit" action of a record row; the label names the record for screen readers. */
export function EditButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="linkbtn"
      aria-label={t('form.editLabel', { name })}
      onClick={onClick}
    >
      {t('form.edit')}
    </button>
  );
}
