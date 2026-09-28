// Cross-platform share actions for the Share Kit: native share sheet with files (phone app),
// platform share URLs / Web Share API (browser), downloads.
import { cartName, photoDownloadUrl } from '../cartLogic';
import { downloadName, saveAllPhotos } from '../photos';
import { copyText } from '../../native/actions';
import { isNativeApp } from '../../native/platform';
import type { Cart } from '../types';
import type { SharePlatform } from '../growthTypes';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Downloads a cart photo through the CORS-enabled photo worker. */
export async function fetchPhotoBlob(file: string, name?: string): Promise<Blob> {
  const res = await fetch(photoDownloadUrl(file, name));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

/** Phone app: writes blobs to the app cache and returns their file URIs (same approach as mp/photos.ts). */
export async function writeCacheFiles(items: Array<{ name: string; blob: Blob }>): Promise<string[]> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const uris: string[] = [];
  for (const { name, blob } of items) {
    const saved = await Filesystem.writeFile({
      path: `share/${name}`,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    });
    uris.push(saved.uri);
  }
  return uris;
}

/** Downloads the selected cart photos as named blobs (failures are skipped). */
export async function photoBlobs(cart: Cart, files: string[]): Promise<Array<{ name: string; blob: Blob }>> {
  const out: Array<{ name: string; blob: Blob }> = [];
  for (let i = 0; i < files.length; i++) {
    const name = downloadName(cart, i, files[i]);
    try {
      out.push({ name, blob: await fetchPhotoBlob(files[i], name) });
    } catch (e) {
      console.warn('Photo download failed', files[i], e);
    }
  }
  return out;
}

/** Native share sheet with text and optional files (phone app). */
export async function nativeShare(opts: { title: string; text: string; files?: Array<{ name: string; blob: Blob }> }) {
  const { Share } = await import('@capacitor/share');
  const uris = opts.files?.length ? await writeCacheFiles(opts.files) : [];
  await Share.share({ title: opts.title, text: opts.text, dialogTitle: 'Share', ...(uris.length ? { files: uris } : {}) });
}

/** True when the browser can share these files through the Web Share API. */
export function canWebShareFiles(files: File[]): boolean {
  try {
    return !!navigator.share && !!navigator.canShare && files.length > 0 && navigator.canShare({ files });
  } catch {
    return false;
  }
}

/** Saves a blob: share sheet in the app, download in the browser. */
export async function saveBlob(blob: Blob, name: string, title = 'TIGON') {
  if (isNativeApp()) {
    await nativeShare({ title, text: '', files: [{ name, blob }] });
    return;
  }
  const file = new File([blob], name, { type: blob.type });
  if (/iPhone|iPad|Android/i.test(navigator.userAgent) && canWebShareFiles([file])) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Opens a URL in a new tab; returns false when the popup was blocked. */
function openTab(url: string): boolean {
  const w = window.open(url, '_blank');
  if (!w) return false;
  w.opener = null;
  return true;
}

export interface ShareRequest {
  platform: SharePlatform;
  cart: Cart;
  title: string;
  text: string;
  link: string;
  photos: string[];
}

export interface ShareResult {
  /** Toast shown after the action. */
  message: string;
  /** Browser blocked the popup/share (needs a fresh tap): run this from a button. */
  retry?: () => void;
}

/**
 * Shares to a platform.
 * Phone app: native sheet with caption + photos (caption also copied, since some apps drop text).
 * Browser: platform share URL, or Web Share API / copy + download for Instagram, TikTok and "More".
 */
export async function shareTo(req: ShareRequest): Promise<ShareResult> {
  const { platform, text, title, link } = req;
  if (isNativeApp()) {
    await copyText(text).catch(() => undefined);
    const files = await photoBlobs(req.cart, req.photos);
    await nativeShare({ title, text, files });
    return { message: 'Caption copied — paste it if the app doesn\'t fill it in.' };
  }

  const enc = encodeURIComponent;
  const webUrl: Partial<Record<SharePlatform, string>> = {
    whatsapp: `https://wa.me/?text=${enc(text)}`,
    x: `https://x.com/intent/post?text=${enc(text)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(link)}`,
  };
  if (platform === 'sms') {
    window.location.href = `sms:?&body=${enc(text)}`;
    return { message: 'Opening Messages…' };
  }
  if (platform === 'email') {
    window.location.href = `mailto:?subject=${enc(title)}&body=${enc(text)}`;
    return { message: 'Opening email…' };
  }
  const url = webUrl[platform];
  if (url) {
    if (platform === 'facebook') await copyText(text).catch(() => undefined);
    const msg = platform === 'facebook' ? 'Caption copied — paste it into your Facebook post.' : `Opening ${platform === 'x' ? 'X' : 'WhatsApp'}…`;
    if (openTab(url)) return { message: msg };
    return { message: 'Your browser blocked the new tab.', retry: () => openTab(url) };
  }

  // Instagram, TikTok, "More": Web Share API with photos when available.
  const blobs = await photoBlobs(req.cart, req.photos);
  const files = blobs.map((b) => new File([b.blob], b.name, { type: b.blob.type || 'image/jpeg' }));
  const shareData: ShareData = canWebShareFiles(files) ? { title, text, files } : { title, text, url: link };
  if (navigator.share && (canWebShareFiles(files) || platform === 'other')) {
    try {
      await navigator.share(shareData);
      return { message: 'Shared.' };
    } catch (e) {
      const name = (e as Error).name;
      if (name === 'AbortError') return { message: 'Share cancelled.' };
      if (name === 'NotAllowedError') {
        return { message: 'Tap "Share now" to open the share sheet.', retry: () => { navigator.share(shareData).catch(() => undefined); } };
      }
    }
  }
  await copyText(text);
  if (platform === 'other') return { message: 'Caption + link copied.' };
  await saveAllPhotos(req.cart, req.photos);
  const site = platform === 'instagram' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/upload';
  const label = platform === 'instagram' ? 'Instagram' : 'TikTok';
  const message = `Caption copied and photos downloading — create a new post in ${label} and paste the caption.`;
  if (openTab(site)) return { message };
  return { message, retry: () => openTab(site) };
}

/** File-name friendly cart name. */
export const cartFileBase = (cart: Cart) => cartName(cart).replace(/[^\w.-]+/g, '_');
