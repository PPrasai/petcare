import { useId } from 'react';
import { ALLOWED_FILE_TYPES } from '../../application/ports/file-gateway';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';

const DEFAULT_MAX = 10_485_760;
const HEIC = /\.(heic|heif)$/i;

/** Whether the browser's file looks like one of the allowed types (the server checks again). */
export function isAllowedFile(file: File): boolean {
  if ((ALLOWED_FILE_TYPES as readonly string[]).includes(file.type)) return true;
  return file.type === '' && HEIC.test(file.name);
}

interface Props {
  label: string;
  /** Called with a chosen file, or null when it was cleared or refused. */
  onPick: (file: File | null) => void;
  error?: string | undefined;
  /** Shown on the line below the field. */
  onRefused: (message: string) => void;
}

/** A file input that refuses unsupported types and files over the size limit before upload. */
export function FilePicker({ label, onPick, error, onRefused }: Props) {
  const id = useId();
  const max = useSessionStore((s) => s.config?.maxFileBytes ?? DEFAULT_MAX);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf,.heic"
        className="min-h-11 rounded-lg border border-line bg-surface px-3 py-2"
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          if (file && !isAllowedFile(file)) {
            e.target.value = '';
            onRefused(t('files.badType'));
            onPick(null);
          } else if (file && file.size > max) {
            e.target.value = '';
            onRefused(t('files.tooLarge', { mb: String(Math.round(max / 1_048_576)) }));
            onPick(null);
          } else {
            onPick(file);
          }
        }}
      />
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </div>
  );
}
