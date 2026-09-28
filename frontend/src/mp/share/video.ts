// Vertical promo slideshow (1080×1920) recorded from a canvas with MediaRecorder:
// Ken Burns zoom, crossfades, text overlays and a closing "Call/Text today" card.
import { BRAND_BLUE, BRAND_RED, drawCover, drawLogo, drawPriceBadge, font, wrapText } from './graphics';

export const VIDEO_W = 1080;
export const VIDEO_H = 1920;

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/** Best supported recording type ('' when this device can't record canvas video). */
export function pickVideoMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined') return '';
  if (!('captureStream' in HTMLCanvasElement.prototype)) return '';
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* keep looking */
    }
  }
  return '';
}

export interface SlideshowInput {
  photos: HTMLImageElement[];
  logo: HTMLImageElement | null;
  title: string;
  price: string;
  phone: string;
  place: string;
  secondsPerPhoto?: number;
}

const FADE = 0.7;
const OUTRO = 3;

/** Total length in seconds. */
export const slideshowSeconds = (count: number, per = 3) => count * per + OUTRO;

/** Draws one frame at time t (seconds). */
export function drawSlideshowFrame(ctx: CanvasRenderingContext2D, input: SlideshowInput, t: number) {
  const per = input.secondsPerPhoto ?? 3;
  const n = input.photos.length;
  const W = VIDEO_W;
  const H = VIDEO_H;
  ctx.globalAlpha = 1;
  ctx.fillStyle = BRAND_BLUE;
  ctx.fillRect(0, 0, W, H);

  const drawPhoto = (i: number, alpha: number) => {
    if (i < 0 || i >= n || alpha <= 0) return;
    const local = Math.min(1, Math.max(0, (t - i * per) / (per + FADE)));
    const dir = i % 2 === 0 ? 1 : -1;
    ctx.globalAlpha = alpha;
    drawCover(ctx, input.photos[i], 0, 0, W, H, 1.02 + 0.14 * local, dir * (local * 2 - 1) * 0.6, -0.2 + 0.4 * local);
    ctx.globalAlpha = 1;
  };

  const idx = Math.floor(t / per);
  const within = t - idx * per;
  if (idx < n) {
    drawPhoto(idx, 1);
    // Crossfade into the next photo (or the outro card) near the end of this slide.
    if (within > per - FADE) {
      const a = (within - (per - FADE)) / FADE;
      if (idx + 1 < n) drawPhoto(idx + 1, a);
      else drawOutro(ctx, input, a);
    }
  } else {
    drawOutro(ctx, input, 1);
    return;
  }

  // Overlays: gradients, brand bars, logo, title, price, phone.
  const top = ctx.createLinearGradient(0, 0, 0, 360);
  top.addColorStop(0, 'rgba(0,0,0,0.55)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 360);
  const bottom = ctx.createLinearGradient(0, H - 820, 0, H);
  bottom.addColorStop(0, 'rgba(0,0,0,0)');
  bottom.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H - 820, W, 820);
  ctx.fillStyle = BRAND_RED;
  ctx.fillRect(0, 0, W, 18);
  drawLogo(ctx, input.logo, 60, 110, 80);

  // Title slides in on the first photo, stays after.
  const intro = Math.min(1, t / 0.8);
  ctx.save();
  ctx.globalAlpha = intro;
  ctx.translate((1 - intro) * -80, 0);
  ctx.fillStyle = '#fff';
  ctx.font = font(82, 900);
  const y = wrapText(ctx, input.title, 60, H - 470, W - 120, 94, 2);
  ctx.font = font(48, 600);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText([input.place, input.phone].filter(Boolean).join(' · '), 60, y + 20);
  ctx.restore();
  if (input.price) drawPriceBadge(ctx, input.price, W - 60, H - 700, 130);

  // "Call/Text today" band on the last photo.
  if (idx === n - 1) {
    const a = Math.min(1, within / 0.5);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = BRAND_RED;
    ctx.fillRect(0, H - 190, W, 130);
    ctx.fillStyle = '#fff';
    ctx.font = font(60, 900);
    ctx.textAlign = 'center';
    ctx.fillText(`Call/Text today${input.phone ? ` ${input.phone}` : ''}`, W / 2, H - 105);
    ctx.restore();
  }
}

function drawOutro(ctx: CanvasRenderingContext2D, input: SlideshowInput, alpha: number) {
  const W = VIDEO_W;
  const H = VIDEO_H;
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, BRAND_BLUE);
  g.addColorStop(1, '#062540');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = BRAND_RED;
  ctx.fillRect(0, 0, W, 24);
  ctx.fillRect(0, H - 24, W, 24);
  drawLogo(ctx, input.logo, 140, 560, 120);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = font(72, 900);
  wrapText(ctx, input.title, W / 2, 860, W - 160, 84, 2);
  if (input.price) {
    ctx.font = font(110, 900);
    ctx.fillStyle = '#fff';
    ctx.fillText(input.price, W / 2, 1110);
  }
  ctx.font = font(76, 900);
  ctx.fillStyle = '#fff';
  ctx.fillText('Call/Text today', W / 2, 1320);
  ctx.font = font(84, 900);
  ctx.fillStyle = '#ffd7dc';
  if (input.phone) ctx.fillText(input.phone, W / 2, 1430);
  ctx.font = font(48, 500);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  if (input.place) ctx.fillText(`TIGON Golf Carts · ${input.place}`, W / 2, 1540);
  ctx.fillText('Financing & delivery available', W / 2, 1610);
  ctx.restore();
}

export interface RecordResult {
  blob: Blob;
  mimeType: string;
  ext: 'mp4' | 'webm';
}

/**
 * Plays the slideshow on `canvas` in real time and records it.
 * `onProgress` gets 0..1. Abort with `signal`.
 */
export function recordSlideshow(
  canvas: HTMLCanvasElement, input: SlideshowInput, onProgress: (p: number) => void, signal?: AbortSignal,
): Promise<RecordResult> {
  const mimeType = pickVideoMime();
  if (!mimeType) return Promise.reject(new Error('This device can\'t record video from the app.'));
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext('2d')!;
  const total = slideshowSeconds(input.photos.length, input.secondsPerPhoto ?? 3);
  drawSlideshowFrame(ctx, input, 0);
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  return new Promise<RecordResult>((resolve, reject) => {
    let timer = 0;
    let aborted = false;
    const finish = () => {
      window.clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach((tr) => tr.stop());
    };
    recorder.onstop = () => {
      if (aborted) return reject(new DOMException('Cancelled', 'AbortError'));
      const type = mimeType.split(';')[0];
      resolve({ blob: new Blob(chunks, { type }), mimeType: type, ext: type === 'video/mp4' ? 'mp4' : 'webm' });
    };
    recorder.onerror = () => {
      finish();
      reject(new Error('Recording failed.'));
    };
    signal?.addEventListener('abort', () => {
      aborted = true;
      finish();
    });
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (t >= total) {
        drawSlideshowFrame(ctx, input, total);
        onProgress(1);
        // Let the last frames reach the recorder before stopping.
        timer = window.setTimeout(finish, 150);
        return;
      }
      drawSlideshowFrame(ctx, input, t);
      onProgress(t / total);
      timer = window.setTimeout(tick, 1000 / 30);
    };
    recorder.start(250);
    tick();
  });
}
