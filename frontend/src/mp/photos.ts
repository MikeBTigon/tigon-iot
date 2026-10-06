import { registerPlugin } from '@capacitor/core';
import { cartName, photoDownloadUrl } from './cartLogic';
import type { Cart } from './types';
import { isNativeApp, nativePlatform } from '../native/platform';
import { notify } from '../ui/notify';

function fileBase(cart: Cart): string {
  return `${cartName(cart)}${cart.serial ? ' ' + cart.serial : ''}`.replace(/[^\w.-]+/g, '_');
}

export function downloadName(cart: Cart, index: number, file: string): string {
  const ext = (file.split('?')[0].match(/\.(jpe?g|png|webp)$/i)?.[0] || '.jpg').toLowerCase();
  return `${fileBase(cart)}_${index + 1}${ext}`;
}

// ---------------------------------------------------------------------------
// Phone app (Android): straight into the Gallery — Pictures/TIGON/<cart>
// ---------------------------------------------------------------------------

interface GalleryResult { saved: number; failed: number; folder: string }
const TigonGallery = registerPlugin<{
  saveImages(o: { album: string; files: Array<{ url: string; name: string }> }): Promise<GalleryResult>;
}>('TigonGallery');

async function saveToGallery(cart: Cart, files: Array<{ file: string; index: number }>): Promise<GalleryResult> {
  return TigonGallery.saveImages({
    album: fileBase(cart),
    files: files.map(({ file, index }) => {
      const name = downloadName(cart, index, file);
      return { url: photoDownloadUrl(file, name), name };
    }),
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Older app versions / iPhone: no Gallery saver, so fall back to the share sheet ("Save Image"). */
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

async function nativeSave(cart: Cart, files: Array<{ file: string; index: number }>) {
  if (nativePlatform() === 'android') {
    try {
      const r = await saveToGallery(cart, files);
      notify(`${r.saved} photo${r.saved === 1 ? '' : 's'} saved to your Gallery (album "${fileBase(cart)}")${r.failed ? ` — ${r.failed} could not be downloaded` : ''}.`, r.failed ? 'warning' : 'success');
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Old app without the Gallery saver: share sheet instead (update the app to save directly).
      if (!/not implemented|UNIMPLEMENTED/i.test(msg)) throw e;
    }
  }
  await sharePhotos(cart, files);
}

// ---------------------------------------------------------------------------
// Computer: pick a folder (Chrome / Edge), otherwise the Downloads folder
// ---------------------------------------------------------------------------

type DirHandle = {
  name: string;
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }> }>;
};
type PickerWindow = Window & { showDirectoryPicker?: (o?: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<DirHandle> };

const isPhoneBrowser = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
export const canPickFolder = () => !isNativeApp() && !isPhoneBrowser() && typeof (window as PickerWindow).showDirectoryPicker === 'function';

async function saveToFolder(cart: Cart, files: Array<{ file: string; index: number }>): Promise<boolean> {
  let root: DirHandle;
  try {
    // `id` makes the browser open the same folder next time.
    root = await (window as PickerWindow).showDirectoryPicker!({ id: 'tigon-photos', mode: 'readwrite', startIn: 'pictures' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return true; // cancelled
    throw e;
  }
  const dir = await root.getDirectoryHandle(fileBase(cart), { create: true });
  let saved = 0;
  for (const { file, index } of files) {
    const name = downloadName(cart, index, file);
    try {
      const res = await fetch(photoDownloadUrl(file, name));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(await res.blob());
      await w.close();
      saved++;
    } catch (e) {
      console.warn('Photo save failed', file, e);
    }
  }
  if (!saved) throw new Error('Could not download the photos. Check your connection and try again.');
  notify(`${saved} photo${saved === 1 ? '' : 's'} saved to "${root.name}/${fileBase(cart)}"${saved < files.length ? ` — ${files.length - saved} could not be downloaded` : ''}.`, saved < files.length ? 'warning' : 'success');
  return true;
}

function downloadOne(cart: Cart, file: string, index: number) {
  const a = document.createElement('a');
  a.href = photoDownloadUrl(file, downloadName(cart, index, file));
  a.rel = 'noopener';
  a.download = downloadName(cart, index, file);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** One photo: Gallery in the phone app, otherwise a normal download. */
export function savePhoto(cart: Cart, file: string, index: number) {
  if (isNativeApp()) {
    nativeSave(cart, [{ file, index }]).catch((e) => notify(e instanceof Error ? e.message : String(e), 'error'));
    return;
  }
  downloadOne(cart, file, index);
}

/**
 * "Save all photos": phone app → straight into the Gallery; computer (Chrome / Edge) → pick a folder, saved in a
 * sub-folder named after the cart; other browsers → the Downloads folder (spaced out so none are dropped).
 */
export async function saveAllPhotos(cart: Cart, files: string[]) {
  const list = files.map((file, index) => ({ file, index }));
  try {
    if (isNativeApp()) return await nativeSave(cart, list);
    if (canPickFolder() && (await saveToFolder(cart, list))) return;
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), 'error');
    return;
  }
  for (let i = 0; i < files.length; i++) {
    downloadOne(cart, files[i], i);
    await new Promise((r) => setTimeout(r, 450));
  }
  notify(`${files.length} photo${files.length === 1 ? '' : 's'} downloaded to your Downloads folder.`, 'success');
}
