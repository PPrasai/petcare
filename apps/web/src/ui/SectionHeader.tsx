import type { ReactNode } from 'react';
import { Icon } from './icons';
import type { IconName } from './icons';

interface SectionHeaderProps {
  title: string;
  level?: 2 | 3;
  action?: {
    label: string;
    /** Starts with the visible label (WCAG 2.5.3), for example "Add an expense". */
    ariaLabel: string;
    onClick: () => void;
    icon?: IconName;
  };
  aside?: ReactNode;
}

/** A card's heading row: the title, and an optional link-styled action such as "+ Add". */
export function SectionHeader({ title, level = 2, action, aside }: SectionHeaderProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className="sech">
      <Heading>{title}</Heading>
      {aside}
      {action ? (
        <button
          type="button"
          className="linkbtn"
          aria-label={action.ariaLabel}
          onClick={action.onClick}
        >
          <Icon name={action.icon ?? 'plus'} />
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
