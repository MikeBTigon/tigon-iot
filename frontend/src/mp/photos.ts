import { cartName, photoDownloadUrl } from './cartLogic';
import type { Cart } from './types';
import { isNativeApp } from '../native/platform';

function fileBase(cart: Cart): string {
  return `${cartName(cart)}${cart.serial ? ' ' + cart.serial : ''}`.replace(/[^\w.-]+/g, '_');
}

export function downloadName(cart: Cart, index: number, file: string): string {
  const ext = (file.split('?')[0].match(/\.(jpe?g|png|webp)$/i)?.[0] || '.jpg').toLowerCase();
  return `${fileBase(cart)}_${index + 1}${ext}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Phone app: download photos into the app cache, then open the share sheet so the
 * user can "Save Image(s)" to their photo library in one tap.
 */
async function sharePhotos(cart: Cart, files: Array<{ file: string; index: number }>) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const uris: string[] = [];
  for (const { file, index } of files) {
    const name = downloadName(cart, index, file);
    try {
      const res = await fetch(photoDownloadUrl(file, name));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved = await Filesystem.writeFile({
        path: `photos/${name}`,
        data: await blobToBase64(await res.blob()),
        directory: Directory.Cache,
        recursive: true,
      });
      uris.push(saved.uri);
    } catch (e) {
      console.warn('Photo download failed', file, e);
    }
  }
  if (!uris.length) throw new Error('Could not download the photos. Check your connection and try again.');
  await Share.share({ title: cartName(cart), files: uris });
}

/** Triggers a download through the photo worker (Content-Disposition: attachment). */
export function savePhoto(cart: Cart, file: string, index: number) {
  if (isNativeApp()) {
    sharePhotos(cart, [{ file, index }]).catch((e) => alert(e.message));
    return;
  }
  const a = document.createElement('a');
  a.href = photoDownloadUrl(file, downloadName(cart, index, file));
  a.rel = 'noopener';
  a.download = downloadName(cart, index, file);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Saves every photo, spaced out so browsers don't drop them (Android asks once to allow). */
export async function saveAllPhotos(cart: Cart, files: string[]) {
  if (isNativeApp()) {
    await sharePhotos(cart, files.map((file, index) => ({ file, index }))).catch((e) => alert(e.message));
    return;
  }
  for (let i = 0; i < files.length; i++) {
    savePhoto(cart, files[i], i);
    await new Promise((r) => setTimeout(r, 450));
  }
}
