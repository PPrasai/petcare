import type { ReactNode, Ref } from 'react';

interface BannerProps {
  tone?: 'info' | 'warn';
  children: ReactNode;
  /** Lets a form move focus to the message after a failed submit. */
  ref?: Ref<HTMLDivElement>;
  tabIndex?: number;
  /** Lets disabled controls point at it with aria-describedby. */
  id?: string;
}

/** A short status message. `role="status"` makes screen readers announce changes politely. */
export function Banner({ tone = 'info', children, ref, tabIndex, id }: BannerProps) {
  return (
    <div
      id={id}
      ref={ref}
      tabIndex={tabIndex}
      role="status"
      className={`banner ${tone === 'warn' ? 'banner-warn' : ''}`}
    >
      {children}
    </div>
  );
}
