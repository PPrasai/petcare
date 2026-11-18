import type { HTMLAttributes, KeyboardEvent } from 'react';
import { t } from '../../i18n/t';
import { useWideScreen } from './use-wide-screen';

/**
 * The "Edit" action of a record row from 860 px; the label names the record for screen readers.
 * On a phone there is no extra button (the phone rows keep their layout): the record's title is
 * the edit target instead, see `useEditTap`.
 */
export function EditButton({ name, onClick }: { name: string; onClick: () => void }) {
  if (!useWideScreen()) return null;
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

/**
 * On a phone: the attributes that make an existing element (a row's title) open the edit sheet,
 * without adding an element. From 860 px nothing, because the row has an Edit button.
 */
export function useEditTap(): (
  name: string,
  onEdit: () => void,
) => HTMLAttributes<HTMLElement> | undefined {
  const wide = useWideScreen();
  return (name, onEdit) => {
    if (wide) return undefined;
    return {
      role: 'button',
      tabIndex: 0,
      'aria-label': t('form.editLabel', { name }),
      onClick: onEdit,
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      },
    };
  };
}
