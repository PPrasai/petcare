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
    // The library's SVG path only: `qrcode`'s own entry also pulls in the canvas renderer.
    void Promise.all([
      import('qrcode/lib/core/qrcode'),
      import('qrcode/lib/renderer/svg-tag.js'),
    ]).then(([{ default: QRCode }, { default: SvgRenderer }]) => {
      const markup = SvgRenderer.render(QRCode.create(link), { margin: 1 });
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
