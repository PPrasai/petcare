/** How pet photos are reduced before they are kept and uploaded (FM-petcare-002 3b, QA-35). */
export const PHOTO_LONG_EDGE_PX = 768;
export const PHOTO_QUALITY = 0.82;
export const PHOTO_RETRY_QUALITY = 0.7;
export const PHOTO_TARGET_BYTES = 200 * 1024;

/** The file could not be read as an image (not an image, corrupt, or a format the browser lacks). */
export class PhotoUnusable extends Error {
  constructor() {
    super('photo cannot be used');
    this.name = 'PhotoUnusable';
  }
}

/**
 * Shrinks a chosen image to a JPEG: the long edge at most 768 px, the camera's orientation
 * applied, no metadata (so no location). Throws `PhotoUnusable` when the file cannot be decoded.
 */
export interface ImageReducer {
  reduce(file: File): Promise<Blob>;
}
