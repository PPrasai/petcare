import { useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './icons';

/** Where the desktop layout starts (the same breakpoint as the app's `useWideScreen`). */
const WIDE = '(min-width: 860px)';

/**
 * A native <details> with a title, a one-line hint and a turning chevron. The content is only
 * rendered while it is open, so closed sections cost nothing and never duplicate a form. It starts
 * open from 860 px (the user may close it); on a phone it starts closed, as the list there is short.
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
  const [open, setOpen] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches,
  );
  return (
    <details
      className="disc"
      open={open}
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
