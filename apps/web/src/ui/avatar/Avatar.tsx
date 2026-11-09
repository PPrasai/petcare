import type { CSSProperties, ReactNode } from 'react';
import { Illustration, artFor, swatchFor } from './illustrations';

interface AvatarProps {
  petId: string;
  species: string;
  /** Edge length in px. */
  size: number;
  /** A displayable URL of the pet's own photo, when it has one. */
  photoUrl?: string | null;
  /** The accessible text of the photo, for example "Photo of Momo". */
  photoAlt?: string;
  /** The tone of the status dot; no dot without it. */
  dot?: 'overdue' | 'today' | 'soon' | 'ok';
  /** A control laid over the lower right corner, such as the camera badge. */
  badge?: ReactNode;
}

/** The pet's photo, or the species illustration when there is none. */
export function Avatar({ petId, species, size, photoUrl, photoAlt = '', dot, badge }: AvatarProps) {
  const swatch = swatchFor(petId);
  const style = { '--s': `${size}px`, '--pc': swatch.fill } as CSSProperties;
  return (
    <span className="avwrap">
      <span className="av" style={style}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={photoAlt}
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <Illustration art={artFor(species)} fill={swatch.fill} ink={swatch.ink} />
        )}
      </span>
      {dot ? <i className={`sdot ${dot}`} /> : null}
      {badge}
    </span>
  );
}
