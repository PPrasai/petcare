import type { HTMLAttributes } from 'react';

/** A bordered surface. `pad` adds the standard inner padding. */
export function Card({
  pad = true,
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { pad?: boolean }) {
  return <div className={`card ${pad ? 'pad' : ''} ${className}`} {...rest} />;
}
