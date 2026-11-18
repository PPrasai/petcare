import type { HTMLAttributes, ReactNode } from 'react';

interface LineProps {
  title: ReactNode;
  sub?: ReactNode;
  /** An avatar or initials at the left. */
  lead?: ReactNode;
  /** A pill or an amount, right-aligned. */
  aside?: ReactNode;
  actions?: ReactNode;
  /** Attributes for the title, to make it a tap target (the phone edit action). */
  titleProps?: HTMLAttributes<HTMLElement> | undefined;
  as?: 'li' | 'div';
  testId?: string;
}

/** One row of a list: lead, title with a sub line, an aside and actions (SPEC-petcare-003 P-4). */
export function Line({
  title,
  sub,
  lead,
  aside,
  actions,
  titleProps,
  as = 'li',
  testId,
}: LineProps) {
  const Root = as;
  return (
    <Root className="line" data-testid={testId}>
      {lead}
      <div className="l">
        <b {...titleProps}>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </div>
      {aside}
      {actions}
    </Root>
  );
}
