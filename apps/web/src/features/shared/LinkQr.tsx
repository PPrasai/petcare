import { useEffect, useState } from 'react';

/**
 * The QR code of a link, drawn as inline SVG (no external request). It stays white in dark mode.
 * The `qrcode` library is a separate chunk, loaded when the first code is drawn. It is still in the
 * service worker's precache, so it works offline.
 */
export function LinkQr({
  link,
  label,
  className = '',
}: {
  link: string;
  label: string;
  /** Extra classes for a caller that sizes the code itself. */
  className?: string;
}) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    void import('qrcode').then(async ({ default: QRCode }) => {
      const markup = await QRCode.toString(link, { type: 'svg', margin: 1 });
      if (live) setSvg(markup);
    });
    return () => {
      live = false;
    };
  }, [link]);
  return (
    <div
      role="img"
      aria-label={label}
      className={`qr ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
