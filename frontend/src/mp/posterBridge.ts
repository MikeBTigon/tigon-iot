// Talks to the "Tigon Poster" Chrome extension (mp-assistant/poster) on computers: the extension fills the
// Facebook Marketplace vehicle form and uploads the photos. Its bridge script marks <html data-tigon-poster>.
import { photoUrl } from './cartLogic';
import type { MpCart } from './types';

export const POSTER_ZIP_URL = 'https://tigon-iot.firebaseapp.com/downloads/tigon-poster.zip';

/** Installed extension version, or '' when it isn't installed (or on phones). */
export const posterVersion = () => document.documentElement.getAttribute('data-tigon-poster') || '';

/** Hands one listing to the extension; the Facebook tab then fills itself in. */
export function sendToPoster(cart: MpCart, photos: string[], listing: { title1?: string; description: string }) {
  window.postMessage({
    source: 'tigon-iot',
    type: 'TIGON_SEND_LISTING',
    id: `${cart.docId}-${Date.now()}`,
    payload: {
      cart: {
        docId: cart.docId, year: cart.year, make: cart.make, model: cart.model, price: cart.price,
        locationId: cart.locationId, vin: cart.vin, color: cart.color,
        photos: photos.map((p) => photoUrl(p)),
      },
      listing: { title1: listing.title1 || '', description: listing.description },
    },
  }, window.location.origin);
}
