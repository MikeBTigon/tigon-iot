// Renders a QR code to a standalone canvas (for drawing into post images) using qrcode.react offscreen.
import { createRoot } from 'react-dom/client';
import { QRCodeCanvas } from 'qrcode.react';

/** Returns a canvas with the QR code for `value` (size×size px, white quiet zone). */
export async function qrCanvas(value: string, size = 480): Promise<HTMLCanvasElement> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(<QRCodeCanvas value={value} size={size} marginSize={2} level="M" bgColor="#ffffff" fgColor="#000000" />);
    // qrcode.react draws in an effect; wait until the canvas exists and has been painted.
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 25));
      const c = host.querySelector('canvas');
      if (i >= 1 && c && c.width > 0) {
        const out = document.createElement('canvas');
        out.width = size;
        out.height = size;
        out.getContext('2d')!.drawImage(c, 0, 0, size, size);
        return out;
      }
    }
    throw new Error('QR code did not render');
  } finally {
    root.unmount();
    host.remove();
  }
}
