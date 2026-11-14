import { useId } from 'react';
import { ALLOWED_FILE_TYPES } from '../../application/ports/file-gateway';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';

const DEFAULT_MAX = 10_485_760;
/** The file types the chooser offers. */
export const FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf,.heic';
const HEIC = /\.(heic|heif)$/i;

/** Whether the browser's file looks like one of the allowed types (the server checks again). */
export function isAllowedFile(file: File): boolean {
  if ((ALLOWED_FILE_TYPES as readonly string[]).includes(file.type)) return true;
  return file.type === '' && HEIC.test(file.name);
}

/** The message to show when a file cannot be used, or null when it can (the server checks again). */
export function fileProblem(file: File, max: number): string | null {
  if (!isAllowedFile(file)) return t('files.badType');
  if (file.size > max) return t('files.tooLarge', { mb: String(Math.round(max / 1_048_576)) });
  return null;
}

/** The size limit in bytes from the server config. */
export function useMaxFileBytes(): number {
  return useSessionStore((s) => s.config?.maxFileBytes ?? DEFAULT_MAX);
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
  const max = useMaxFileBytes();
  return (
    <div className="fld">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={FILE_ACCEPT}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          const problem = file ? fileProblem(file, max) : null;
          if (file && problem) {
            e.target.value = '';
            onRefused(problem);
            onPick(null);
          } else {
            onPick(file);
          }
        }}
      />
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
