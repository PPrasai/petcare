import { useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Button, SelectField, Sheet, SheetHead, TextField } from '../../ui';
import { useFocusInvalid } from '../shared/use-focus-invalid';

export interface FieldSpec {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'datetime-local' | 'number' | 'select';
  options?: { value: string; label: string }[];
  /** Sits beside the next half-width field in a two-column row. */
  half?: boolean;
}

interface Props {
  title: string;
  fields: FieldSpec[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onSubmit: () => void;
  submitLabel: string;
  /** Names of fields to flag, with the message to show. */
  errors?: Record<string, string>;
  /** Extra controls placed before the submit button (for example schedule fields). */
  children?: ReactNode;
}

/** A form sheet: the heading, a close button and the form inside one modal. */
export function RecordSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} label={title} onClose={onClose}>
      <SheetHead title={title} onClose={onClose} />
      {children}
    </Sheet>
  );
}

/** A labelled form over plain string values. The caller converts and validates on submit. */
export function RecordForm({
  title,
  fields,
  values,
  onChange,
  onSubmit,
  submitLabel,
  errors = {},
  children,
}: Props) {
  const form = useRef<HTMLFormElement>(null);
  useFocusInvalid(form, errors);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  const control = (f: FieldSpec) =>
    f.type === 'select' ? (
      <SelectField
        key={f.name}
        label={f.label}
        value={values[f.name] ?? ''}
        options={f.options ?? []}
        onChange={(e) => onChange({ ...values, [f.name]: e.target.value })}
      />
    ) : (
      <TextField
        key={f.name}
        label={f.label}
        type={f.type ?? 'text'}
        {...(f.type === 'number' ? { inputMode: 'decimal' as const } : {})}
        value={values[f.name] ?? ''}
        error={errors[f.name]}
        onChange={(e) => onChange({ ...values, [f.name]: e.target.value })}
      />
    );

  // A half-width field pairs with the next one when that is half-width too.
  const rows: ReactNode[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i] as FieldSpec;
    const next = fields[i + 1];
    if (f.half && next?.half) {
      rows.push(
        <div className="row2" key={f.name}>
          {control(f)}
          {control(next)}
        </div>,
      );
      i++;
    } else rows.push(control(f));
  }

  return (
    <form ref={form} aria-label={title} onSubmit={submit}>
      {rows}
      {children}
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
