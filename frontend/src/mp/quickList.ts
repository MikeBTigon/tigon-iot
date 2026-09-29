// "Quick FB List": one tap from a cart to a filled-in Facebook Marketplace vehicle form.
//   Android app  → Facebook opens inside the app (FbListingActivity) and fills itself in + attaches photos.
//   Computer     → the Tigon Poster Chrome extension fills the form in a new tab (when installed).
//   Otherwise    → assisted: description copied, Facebook opened (photos via "Save all photos").
import { registerPlugin } from '@capacitor/core';
import { generateVariations, photoUrl } from './cartLogic';
import { MARKETPLACE_CREATE_URL, locationName } from './constants';
import { posterVersion, sendToPoster } from './posterBridge';
import { isNativeApp, nativePlatform } from '../native/platform';
import { copyText, openExternal } from '../native/actions';
import type { MpCart } from './types';

const TigonFbList = registerPlugin<{ open(o: { payload: string }): Promise<void> }>('TigonFbList');

export type QuickListMode = 'in-app' | 'extension' | 'assisted';

export function quickListMode(): QuickListMode {
  if (isNativeApp() && nativePlatform() === 'android') return 'in-app';
  if (!isNativeApp() && posterVersion()) return 'extension';
  return 'assisted';
}

/** Opens Facebook with everything filled in (per quickListMode). Returns what happened, for a message. */
export async function quickFbList(cart: MpCart, photos: string[], userKey: string, variation = 0): Promise<string> {
  const listing = generateVariations(cart, userKey)[variation] || generateVariations(cart, userKey)[0];
  const mode = quickListMode();
  if (mode === 'in-app') {
    const payload = JSON.stringify({
      cart: {
        year: cart.year, make: cart.make, model: cart.model, price: cart.price, cityState: locationName(cart.locationId),
        photos: photos.map((p) => photoUrl(p)).slice(0, 20),
      },
      listing: { title1: listing.title1, description: listing.description },
    });
    await TigonFbList.open({ payload });
    return 'Facebook opened — it fills in and attaches the photos. Check it, then tap Publish.';
  }
  if (mode === 'extension') {
    sendToPoster(cart, photos, listing);
    window.open(MARKETPLACE_CREATE_URL, '_blank', 'noopener');
    return 'Facebook is opening — Tigon Poster fills in the form and uploads the photos. Check it, then click Publish.';
  }
  return openFacebookAssisted(cart, userKey, variation);
}

/** Fallback / "Open Facebook app": copies the description and opens Facebook (the app on phones). */
export async function openFacebookAssisted(cart: MpCart, userKey: string, variation = 0): Promise<string> {
  const listing = generateVariations(cart, userKey)[variation] || generateVariations(cart, userKey)[0];
  await copyText(listing.description);
  await openExternal(MARKETPLACE_CREATE_URL);
  return 'Description copied — paste it into Facebook. Use "Save all photos" to add the pictures.';
}
