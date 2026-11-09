import type { CSSProperties } from 'react';
import { SWATCHES, hashOf } from './avatar/illustrations';

/** A round monogram: the first letters of the first two words, in a colour taken from `seed`. */
export function Initials({ name, seed }: { name: string; seed: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('');
  const swatch = SWATCHES[hashOf(seed) % SWATCHES.length];
  return (
    <span className="ini" aria-hidden="true" style={{ '--c': swatch?.fill } as CSSProperties}>
      {letters}
    </span>
  );
}
