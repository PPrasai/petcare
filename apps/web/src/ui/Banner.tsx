import type { ReactNode } from 'react';

interface BannerProps {
  tone?: 'info' | 'warn';
  children: ReactNode;
}

/** A short status message. `role="status"` makes screen readers announce changes politely. */
export function Banner({ tone = 'info', children }: BannerProps) {
  const style =
    tone === 'warn' ? 'bg-warn-bg text-warn border-warn' : 'bg-card text-ink border-line';
  return (
    <div role="status" className={`rounded-lg border px-3 py-2 text-sm ${style}`}>
      {children}
    </div>
  );
}
