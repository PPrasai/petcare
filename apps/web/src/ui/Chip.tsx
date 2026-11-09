import type { ButtonHTMLAttributes } from 'react';

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  pressed: boolean;
}

/** A toggle button (`aria-pressed`) used for choices such as species, category and pet. */
export function Chip({ pressed, className = '', type = 'button', ...rest }: ChipProps) {
  return <button type={type} aria-pressed={pressed} className={`chip ${className}`} {...rest} />;
}
