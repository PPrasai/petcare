import { useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './icons';

/**
 * A native <details> with a title, a one-line hint and a turning chevron. The content is only
 * rendered while it is open, so closed sections cost nothing and never duplicate a form.
 */
export function Disclosure({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="disc"
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        {title}
        <span>{hint}</span>
        <Icon name="next" />
      </summary>
      <div className="in">{open ? children : null}</div>
    </details>
  );
}
