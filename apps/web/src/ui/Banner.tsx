import type { ReactNode } from 'react';

interface BannerProps {
  tone?: 'info' | 'warn';
  children: ReactNode;
}

/** A short status message. `role="status"` makes screen readers announce changes politely. */
export function Banner({ tone = 'info', children }: BannerProps) {
  return (
    <div role="status" className={`banner ${tone === 'warn' ? 'banner-warn' : ''}`}>
      {children}
    </div>
  );
}
