import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink border-brand',
  secondary: 'bg-card text-ink border-line',
  danger: 'bg-card text-danger border-danger',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** A native button, at least 44 px tall. */
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`min-h-11 min-w-11 cursor-pointer rounded-lg border px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
