import type { HTMLAttributes, Ref } from 'react';

/** A bordered surface. `pad` adds the standard inner padding. */
export function Card({
  pad = true,
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement> & { pad?: boolean; ref?: Ref<HTMLDivElement> }) {
  return <div className={`card ${pad ? 'pad' : ''} ${className}`} {...rest} />;
}
