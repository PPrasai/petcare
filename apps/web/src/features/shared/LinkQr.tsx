import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** The QR code of a link, drawn as inline SVG (no external request). */
export function LinkQr({
  link,
  label,
  className = 'h-40 w-40',
}: {
  link: string;
  label: string;
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
      className={`${className} bg-white p-1 [&>svg]:h-full [&>svg]:w-full`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
