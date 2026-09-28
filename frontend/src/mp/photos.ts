import { photoDownloadUrl } from './cartLogic';
import type { Cart } from './types';
import { cartName } from './cartLogic';

function fileBase(cart: Cart): string {
  return `${cartName(cart)}${cart.serial ? ' ' + cart.serial : ''}`.replace(/[^\w.-]+/g, '_');
}

export function downloadName(cart: Cart, index: number, file: string): string {
  const ext = (file.split('?')[0].match(/\.(jpe?g|png|webp)$/i)?.[0] || '.jpg').toLowerCase();
  return `${fileBase(cart)}_${index + 1}${ext}`;
}

/** Triggers a download through the photo worker (Content-Disposition: attachment). */
export function savePhoto(cart: Cart, file: string, index: number) {
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
  for (let i = 0; i < files.length; i++) {
    savePhoto(cart, files[i], i);
    await new Promise((r) => setTimeout(r, 450));
  }
}
