/** Species illustrations transcribed from the Pebble mock's art(). Decorative: `aria-hidden`. */
export interface Swatch {
  fill: string;
  ink: string;
}

/** Eight swatches, taken from the mock's pet colours; a pet always gets the same one. */
export const SWATCHES: readonly Swatch[] = [
  { fill: '#D9A35B', ink: '#7A4E16' },
  { fill: '#9DA9BB', ink: '#38465C' },
  { fill: '#C79A78', ink: '#5C3B22' },
  { fill: '#8FB89A', ink: '#35553E' },
  { fill: '#7FB59A', ink: '#2F5A45' },
  { fill: '#B8A3D0', ink: '#4A3B66' },
  { fill: '#D9A0A0', ink: '#6B3030' },
  { fill: '#8FB0C9', ink: '#2D4A63' },
];

/** A small stable string hash. */
export function hashOf(value: string): number {
  let h = 0;
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const FALLBACK: Swatch = { fill: '#D9A35B', ink: '#7A4E16' };

export const swatchFor = (petId: string): Swatch =>
  SWATCHES[hashOf(petId) % SWATCHES.length] ?? FALLBACK;

export type Art = 'dog' | 'cat' | 'other';

/** Dog and cat get their own drawing; every other species uses the paw. */
export const artFor = (species: string): Art =>
  species === 'dog' || species === 'cat' ? species : 'other';

export function Illustration({ art, fill: c, ink: k }: { art: Art; fill: string; ink: string }) {
  if (art === 'other') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <ellipse cx="50" cy="66" rx="22" ry="18" fill={c} />
        <circle cx="25" cy="46" r="8.5" fill={c} />
        <circle cx="41" cy="31" r="8.5" fill={c} />
        <circle cx="59" cy="31" r="8.5" fill={c} />
        <circle cx="75" cy="46" r="8.5" fill={k} opacity=".6" />
      </svg>
    );
  }
  if (art === 'cat') {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon points="24,46 28,16 47,31" fill={c} />
        <polygon points="76,46 72,16 53,31" fill={c} />
        <polygon points="29,38 31,24 41,32" fill={k} opacity=".35" />
        <polygon points="71,38 69,24 59,32" fill={k} opacity=".35" />
        <circle cx="50" cy="58" r="28" fill={c} />
        <ellipse cx="40" cy="54" rx="3.2" ry="4.2" fill="#1b1b1b" />
        <ellipse cx="60" cy="54" rx="3.2" ry="4.2" fill="#1b1b1b" />
        <polygon points="46,62 54,62 50,67" fill={k} />
        <path
          d="M50 67v3M50 70q-4 4-8 1M50 70q4 4 8 1"
          stroke={k}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M30 64l-14-2M30 68l-13 4M70 64l14-2M70 68l13 4"
          stroke={k}
          strokeWidth="1.2"
          opacity=".5"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="25" cy="52" rx="10" ry="19" fill={k} transform="rotate(10 25 52)" />
      <ellipse cx="75" cy="52" rx="10" ry="19" fill={k} transform="rotate(-10 75 52)" />
      <circle cx="50" cy="52" r="26" fill={c} />
      <ellipse cx="50" cy="64" rx="14" ry="11" fill="#fff" opacity=".88" />
      <circle cx="40" cy="48" r="3.2" fill="#1b1b1b" />
      <circle cx="60" cy="48" r="3.2" fill="#1b1b1b" />
      <ellipse cx="50" cy="58" rx="5.5" ry="4" fill="#1b1b1b" />
      <path
        d="M50 62v4M50 66q-3 3-6 1M50 66q3 3 6 1"
        stroke="#1b1b1b"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
