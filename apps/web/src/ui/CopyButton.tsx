import { t } from '../i18n/t';
import { Button } from './Button';
import { Icon } from './icons';

interface CopyButtonProps {
  value: string;
  label: string;
  copiedToast: string;
  /** Shows a short message (the app's toast). The ui layer cannot import the toast store. */
  onNotify: (message: string) => void;
  variant?: 'secondary' | 'link';
}

/** Copies `value`. When the clipboard is refused it selects the adjacent <code> so it can be copied by hand. */
export function CopyButton({
  value,
  label,
  copiedToast,
  onNotify,
  variant = 'secondary',
}: CopyButtonProps) {
  const copy = async (button: HTMLButtonElement) => {
    try {
      await navigator.clipboard.writeText(value);
      onNotify(copiedToast);
    } catch {
      const code = button.parentElement?.querySelector('code');
      if (code) {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      onNotify(t('ui.copyFailed'));
    }
  };
  const content = (
    <>
      <Icon name="copy" />
      {label}
    </>
  );
  return variant === 'link' ? (
    <button type="button" className="linkbtn" onClick={(e) => void copy(e.currentTarget)}>
      {content}
    </button>
  ) : (
    <Button variant="secondary" onClick={(e) => void copy(e.currentTarget)}>
      {content}
    </Button>
  );
}
