// Branded post / story images drawn on canvas (Share Kit → Graphics) + shared drawing helpers
// used by the promo video.
import { isLithium } from '../cartLogic';
import type { Cart } from '../types';

export const BRAND_RED = '#af1f31';
export const BRAND_BLUE = '#0e4671';

export type GraphicSize = 'post' | 'story';
export type GraphicTemplate = 'bold' | 'overlay' | 'frame';

export const GRAPHIC_SIZES: Record<GraphicSize, { w: number; h: number; label: string }> = {
  post: { w: 1080, h: 1080, label: 'Square post 1080×1080' },
  story: { w: 1080, h: 1920, label: 'Story 1080×1920' },
};

export const GRAPHIC_TEMPLATES: Array<{ id: GraphicTemplate; label: string }> = [
  { id: 'bold', label: 'Bold panel' },
  { id: 'overlay', label: 'Full photo' },
  { id: 'frame', label: 'Framed' },
];

/** Loads an image with CORS so the canvas stays exportable; null when it fails. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Draws an image cover-fit into a box; `zoom` ≥ 1 and pan (-1..1) for Ken Burns. */
export function drawCover(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number },
  x: number, y: number, w: number, h: number, zoom = 1, panX = 0, panY = 0,
) {
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2 + ((dw - w) / 2) * panX;
  const dy = y + (h - dh) / 2 + ((dh - h) / 2) * panY;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

/** Wraps text into at most `maxLines` lines (last line ellipsized); returns the y after the block. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines = 2): number {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = shown[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    shown[maxLines - 1] = `${last}…`;
  }
  shown.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return y + shown.length * lineH;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FONT = '"Roboto", "Helvetica Neue", Arial, sans-serif';
export const font = (px: number, weight = 700) => `${weight} ${px}px ${FONT}`;

/** TIGON wordmark: the logo image when set, else bold text. Drawn with its left edge at x. */
export function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, x: number, y: number, h: number, color = '#fff') {
  if (logo) {
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, x, y, w, h);
    return;
  }
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font(h * 0.8, 900);
  ctx.textBaseline = 'top';
  ctx.fillText('TIGON', x, y + h * 0.08);
  const tw = ctx.measureText('TIGON').width;
  ctx.font = font(h * 0.28, 600);
  ctx.fillText('GOLF CARTS', x + tw + h * 0.18, y + h * 0.42);
  ctx.restore();
}

/** Red price badge (rounded pill) anchored at its right edge. */
export function drawPriceBadge(ctx: CanvasRenderingContext2D, price: string, right: number, y: number, h: number) {
  if (!price) return;
  ctx.save();
  ctx.font = font(h * 0.56, 900);
  const w = ctx.measureText(price).width + h * 0.8;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = h * 0.25;
  ctx.fillStyle = BRAND_RED;
  roundRect(ctx, right - w, y, w, h, h / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(price, right - w / 2, y + h / 2 + 2);
  ctx.restore();
}

export interface GraphicInput {
  size: GraphicSize;
  template: GraphicTemplate;
  photo: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  qr: HTMLCanvasElement | null;
  title: string;
  subtitle: string;
  price: string;
  place: string;
  phone: string;
}

function drawQr(ctx: CanvasRenderingContext2D, qr: HTMLCanvasElement | null, x: number, y: number, s: number, caption = 'Scan for details') {
  if (!qr) return;
  ctx.save();
  ctx.fillStyle = '#fff';
  roundRect(ctx, x - 10, y - 10, s + 20, s + 50, 14);
  ctx.fill();
  ctx.drawImage(qr, x, y, s, s);
  ctx.fillStyle = BRAND_BLUE;
  ctx.font = font(Math.round(s * 0.12), 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(caption, x + s / 2, y + s + 6);
  ctx.restore();
}

function photoOrFill(ctx: CanvasRenderingContext2D, photo: HTMLImageElement | null, x: number, y: number, w: number, h: number) {
  if (photo) drawCover(ctx, photo, x, y, w, h);
  else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, BRAND_BLUE);
    g.addColorStop(1, '#062540');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
}

/** Renders a branded graphic to a new canvas. */
export function renderGraphic(input: GraphicInput): HTMLCanvasElement {
  const { w, h } = GRAPHIC_SIZES[input.size];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const story = input.size === 'story';
  const pad = 56;
  const contact = [input.place, input.phone].filter(Boolean).join(' · ');
  ctx.textBaseline = 'alphabetic';

  if (input.template === 'bold') {
    // Photo on top, blue info panel below with a red stripe.
    const panelH = story ? 760 : 400;
    photoOrFill(ctx, input.photo, 0, 0, w, h - panelH);
    ctx.fillStyle = BRAND_BLUE;
    ctx.fillRect(0, h - panelH, w, panelH);
    ctx.fillStyle = BRAND_RED;
    ctx.fillRect(0, h - panelH - 14, w, 14);
    // Logo tab on the photo
    ctx.fillStyle = 'rgba(14,70,113,0.92)';
    ctx.fillRect(0, story ? 90 : 40, 430, 110);
    ctx.fillStyle = BRAND_RED;
    ctx.fillRect(0, story ? 90 : 40, 14, 110);
    drawLogo(ctx, input.logo, 44, (story ? 90 : 40) + 22, 66);
    drawPriceBadge(ctx, input.price, w - pad, h - panelH - 14 - 70, 120);
    const qrS = story ? 260 : 220;
    const textW = w - pad * 2 - (input.qr ? qrS + 40 : 0);
    ctx.fillStyle = '#fff';
    ctx.font = font(story ? 76 : 60, 900);
    let y = h - panelH + (story ? 150 : 95);
    y = wrapText(ctx, input.title, pad, y, story ? w - pad * 2 : textW, story ? 88 : 70, 2);
    ctx.font = font(story ? 44 : 36, 500);
    ctx.fillStyle = '#d6e4f0';
    y = wrapText(ctx, input.subtitle, pad, y + 10, textW, story ? 54 : 44, story ? 2 : 1);
    ctx.font = font(story ? 46 : 38, 700);
    ctx.fillStyle = '#fff';
    wrapText(ctx, contact, pad, story ? h - 150 : Math.max(y + 36, h - 60), textW, 54, story ? 2 : 1);
    drawQr(ctx, input.qr, w - pad - qrS, story ? h - qrS - 100 : h - qrS - 70, qrS);
    return c;
  }

  if (input.template === 'overlay') {
    // Full-bleed photo with a dark gradient and text at the bottom.
    photoOrFill(ctx, input.photo, 0, 0, w, h);
    const g = ctx.createLinearGradient(0, h * 0.35, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const top = ctx.createLinearGradient(0, 0, 0, 220);
    top.addColorStop(0, 'rgba(0,0,0,0.55)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, 220);
    ctx.fillStyle = BRAND_RED;
    ctx.fillRect(0, 0, w, 16);
    ctx.fillStyle = BRAND_BLUE;
    ctx.fillRect(0, h - 16, w, 16);
    drawLogo(ctx, input.logo, pad, story ? 110 : 52, 72);
    const qrS = story ? 260 : 190;
    drawQr(ctx, input.qr, w - pad - qrS, story ? h - qrS - 120 : h - qrS - 86, qrS);
    const textW = w - pad * 2 - (input.qr ? qrS + 40 : 0);
    let y = story ? h - 700 : h - 400;
    drawPriceBadge(ctx, input.price, pad + Math.min(textW, 520), y - 150, 116);
    ctx.fillStyle = '#fff';
    ctx.font = font(story ? 84 : 64, 900);
    y = wrapText(ctx, input.title, pad, y, story ? w - pad * 2 : textW, story ? 96 : 74, story ? 3 : 2);
    ctx.font = font(story ? 44 : 36, 500);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    y = wrapText(ctx, input.subtitle, pad, y + 12, textW, story ? 54 : 44, story ? 2 : 1);
    ctx.font = font(story ? 46 : 38, 700);
    ctx.fillStyle = '#fff';
    wrapText(ctx, contact, pad, y + 30, textW, 50, story ? 2 : 1);
    return c;
  }

  // 'frame': blue background, framed photo card, red footer.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, BRAND_BLUE);
  bg.addColorStop(1, '#072b48');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  drawLogo(ctx, input.logo, pad, story ? 100 : 40, story ? 80 : 64);
  const frameY = story ? 240 : 130;
  const frameH = story ? 960 : 560;
  ctx.fillStyle = '#fff';
  roundRect(ctx, pad - 12, frameY - 12, w - pad * 2 + 24, frameH + 24, 28);
  ctx.fill();
  ctx.save();
  roundRect(ctx, pad, frameY, w - pad * 2, frameH, 18);
  ctx.clip();
  photoOrFill(ctx, input.photo, pad, frameY, w - pad * 2, frameH);
  ctx.restore();
  drawPriceBadge(ctx, input.price, w - pad - 24, frameY + frameH - 140, 116);
  const footerH = story ? 200 : 130;
  ctx.fillStyle = BRAND_RED;
  ctx.fillRect(0, h - footerH, w, footerH);
  const qrS = story ? 250 : 150;
  const textW = w - pad * 2 - (input.qr ? qrS + 40 : 0);
  let y = frameY + frameH + (story ? 110 : 80);
  ctx.fillStyle = '#fff';
  ctx.font = font(story ? 72 : 52, 900);
  y = wrapText(ctx, input.title, pad, y, textW, story ? 84 : 60, story ? 3 : 2);
  ctx.font = font(story ? 42 : 32, 500);
  ctx.fillStyle = '#d6e4f0';
  wrapText(ctx, input.subtitle, pad, y + 8, textW, story ? 52 : 40, story ? 3 : 1);
  ctx.fillStyle = '#fff';
  ctx.font = font(story ? 46 : 36, 700);
  ctx.textBaseline = 'middle';
  wrapText(ctx, contact, pad, h - footerH / 2, textW, 48, 1);
  ctx.textBaseline = 'alphabetic';
  drawQr(ctx, input.qr, w - pad - qrS, h - footerH - qrS - (story ? 60 : 55), qrS);
  return c;
}

/** canvas → PNG blob. */
export function canvasBlob(c: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export the image (photo blocked by CORS?)'))), type, 0.92));
}

/** Short feature line for graphics ("Blue · 4 passenger · Lithium · Lifted"). */
export function graphicSubtitle(cart: Cart): string {
  return [
    cart.isUsed ? 'Pre-owned' : 'Brand new',
    cart.passengers ? `${cart.passengers} passenger` : '',
    cart.isElectric ? (isLithium(cart.batteryType) ? 'Lithium' : 'Electric') : 'Gas',
    cart.isLifted ? 'Lifted' : '',
    cart.isStreetLegal ? 'Street legal' : '',
    cart.color,
  ].filter(Boolean).join(' · ');
}
