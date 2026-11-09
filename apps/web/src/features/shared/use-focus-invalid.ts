import { useEffect } from 'react';
import type { RefObject } from 'react';

/** After a failed submit, moves focus to the first field that is marked invalid (SPEC-petcare-003 P-3). */
export function useFocusInvalid(form: RefObject<HTMLElement | null>, errors: object) {
  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [form, errors]);
}
