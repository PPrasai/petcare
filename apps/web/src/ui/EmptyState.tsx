import type { ReactNode } from 'react';
import { Icon } from './icons';
import type { IconName } from './icons';

interface EmptyStateProps {
  children: ReactNode;
  icon?: IconName;
  title?: string;
  action?: ReactNode;
  /** 1 on a page of its own (404, a gone link); 2 or 3 inside a card. */
  headingLevel?: 1 | 2 | 3;
  /** Marks a placeholder that is still waiting for data. */
  busy?: boolean;
}

/** The text that stands in for a list with nothing in it, or a page with nothing to show. */
export function EmptyState({
  children,
  icon,
  title,
  action,
  headingLevel = 2,
  busy,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return (
    <div className="empty" aria-busy={busy ? true : undefined}>
      {icon ? <Icon name={icon} /> : null}
      {title ? <Heading className="et">{title}</Heading> : null}
      <p>{children}</p>
      {action ? <div className="ea">{action}</div> : null}
    </div>
  );
}
