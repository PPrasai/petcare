import type { FormEvent, ReactNode } from 'react';
import { Button, SelectField, TextField } from '../../ui';

export interface FieldSpec {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'datetime-local' | 'number' | 'select';
  options?: { value: string; label: string }[];
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
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form
      aria-label={title}
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3"
    >
      {fields.map((f) =>
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
        ),
      )}
      {children}
      <Button type="submit" className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
