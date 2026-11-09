import {
  PHOTO_LONG_EDGE_PX,
  PHOTO_QUALITY,
  PHOTO_RETRY_QUALITY,
  PHOTO_TARGET_BYTES,
  PhotoUnusable,
} from '../../application/ports/image-reducer';
import type { ImageReducer } from '../../application/ports/image-reducer';

const encode = (canvas: HTMLCanvasElement | OffscreenCanvas, quality: number): Promise<Blob> => {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PhotoUnusable())),
      'image/jpeg',
      quality,
    ),
  );
};

/**
 * Reduces a photo with the platform's own decoder and canvas (no image library). Drawing the
 * decoded bitmap onto a fresh canvas and encoding it again drops every piece of metadata,
 * the GPS position included.
 */
export class CanvasImageReducer implements ImageReducer {
  async reduce(file: File): Promise<Blob> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      throw new PhotoUnusable();
    }
    try {
      const scale = Math.min(1, PHOTO_LONG_EDGE_PX / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas =
        typeof OffscreenCanvas === 'undefined'
          ? Object.assign(document.createElement('canvas'), { width, height })
          : new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d') as
        CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!context) throw new PhotoUnusable();
      // JPEG has no transparency: a PNG with clear areas would otherwise turn black.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      let blob = await encode(canvas, PHOTO_QUALITY);
      if (blob.size > PHOTO_TARGET_BYTES) blob = await encode(canvas, PHOTO_RETRY_QUALITY);
      return blob;
    } finally {
      bitmap.close();
    }
  }
}
