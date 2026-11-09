import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  lede?: ReactNode;
  /** A small uppercase line above the title. */
  label?: string;
  /** Right of the title from 860 px, under the lede below it. */
  actions?: ReactNode;
  level?: 1 | 2;
}

/** The title block every top-level route starts with (SPEC-petcare-003 P-1). */
export function PageHeader({ title, lede, label, actions, level = 1 }: PageHeaderProps) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className="greet">
      {label ? <span className="label">{label}</span> : null}
      <Heading>{title}</Heading>
      {lede ? <p className="lede">{lede}</p> : null}
      {actions ? <div className="acts">{actions}</div> : null}
    </div>
  );
}
