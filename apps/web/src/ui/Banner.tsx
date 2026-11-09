import type { ReactNode, Ref } from 'react';

interface BannerProps {
  tone?: 'info' | 'warn';
  children: ReactNode;
  /** Lets a form move focus to the message after a failed submit. */
  ref?: Ref<HTMLDivElement>;
  tabIndex?: number;
}

/** A short status message. `role="status"` makes screen readers announce changes politely. */
export function Banner({ tone = 'info', children, ref, tabIndex }: BannerProps) {
  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="status"
      className={`banner ${tone === 'warn' ? 'banner-warn' : ''}`}
    >
      {children}
    </div>
  );
}
