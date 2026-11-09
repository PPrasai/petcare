import type { ReactNode } from 'react';

interface LineProps {
  title: ReactNode;
  sub?: ReactNode;
  /** An avatar or initials at the left. */
  lead?: ReactNode;
  /** A pill or an amount, right-aligned. */
  aside?: ReactNode;
  actions?: ReactNode;
  as?: 'li' | 'div';
  testId?: string;
}

/** One row of a list: lead, title with a sub line, an aside and actions (SPEC-petcare-003 P-4). */
export function Line({ title, sub, lead, aside, actions, as = 'li', testId }: LineProps) {
  const Root = as;
  return (
    <Root className="line" data-testid={testId}>
      {lead}
      <div className="l">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </div>
      {aside}
      {actions}
    </Root>
  );
}
