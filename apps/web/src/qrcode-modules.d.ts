// The parts of `qrcode` that LinkQr imports directly (the package has no types for its lib/ files).
declare module 'qrcode/lib/core/qrcode' {
  import type { QRCode } from 'qrcode';
  const core: { create(text: string): QRCode };
  export default core;
}
declare module 'qrcode/lib/renderer/svg-tag.js' {
  import type { QRCode } from 'qrcode';
  const renderer: { render(data: QRCode, options?: { margin?: number }): string };
  export default renderer;
}
