import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** The QR code of a link, drawn as inline SVG (no external request). It stays white in dark mode. */
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
    void QRCode.toString(link, { type: 'svg', margin: 1 }).then((markup) => {
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
