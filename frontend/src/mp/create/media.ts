// Photo helpers for listings: client-side resize/compress, upload to Storage, CORS-safe loading
// for canvas editing, and "save to phone".
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../config/firebase';
import { isNativeApp } from '../../native/platform';
import { photoDownloadUrl } from '../cartLogic';

/** Longest side of uploaded photos. */
export const MAX_PHOTO_SIDE = 2000;
export const JPEG_QUALITY = 0.85;

function canvasToBlob(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), 'image/jpeg', quality),
  );
}

/** Loads an image element from a Blob or URL. URLs are requested with CORS so canvases stay readable. */
export function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrl = '';
    if (typeof src === 'string') {
      img.crossOrigin = 'anonymous';
      img.src = corsUrl(src);
    } else {
      objectUrl = URL.createObjectURL(src);
      img.src = objectUrl;
    }
    img.onload = () => {
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      resolve(img);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load the photo.'));
    };
  });
}

/** DMS photos (S3) go through the photo worker, which returns CORS headers; other URLs load directly. */
export function corsUrl(url: string): string {
  return photoDownloadUrl(url);
}

/** Resizes to MAX_PHOTO_SIDE and re-encodes as JPEG (EXIF orientation is applied by the browser). */
export async function compressImage(file: Blob, maxSide = MAX_PHOTO_SIDE, quality = JPEG_QUALITY): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device cannot process photos.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvasToBlob(canvas, quality);
}

const safeName = (name: string) =>
  (name.replace(/\.[a-z0-9]+$/i, '').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'photo') + '.jpg';

/** Uploads a JPEG to mp_media/{uid}/{timestamp}-{name} and returns its download URL. */
export async function uploadMedia(uid: string, blob: Blob, name: string): Promise<string> {
  const path = `mp_media/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName(name)}`;
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg', cacheControl: 'public,max-age=31536000' });
  return getDownloadURL(r);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Phone app: write to the cache and open the share sheet ("Save Image"). Browser: download. */
export async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  if (isNativeApp()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const saved = await Filesystem.writeFile({
      path: `studio/${fileName}`,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({ title: fileName, files: [saved.uri] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export { canvasToBlob };
