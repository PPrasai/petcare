import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  options: { value: string; label: string }[];
}

export function SelectField({ label, options, className = '', ...rest }: SelectFieldProps) {
  const id = useId();
  return (
    <div className="fld">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} className={className} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
