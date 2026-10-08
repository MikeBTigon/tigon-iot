// Public storefront API client (served by the mpStorefrontApi function; no sign-in).
import { PUBLIC_ORIGIN } from '../mp/constants';

/** Public cart fields (mirrors PublicCart in functions/src/mpShare.ts). */
export interface PublicCart {
  id: string;
  title: string;
  year: string;
  make: string;
  model: string;
  color: string;
  price: number;
  isUsed: boolean;
  isElectric: boolean;
  passengers: number;
  lifted: boolean;
  streetLegal: boolean;
  battery: string;
  locationId: string;
  location: string;
  photos: string[];
  features: string[];
  description: string;
  /** Walk-around videos (may be missing on older responses). */
  videos?: string[];
}

export interface PublicStorefront {
  slug: string;
  title: string;
  tagline: string;
  phone: string;
  locationIds: string[];
  showNew: boolean;
  showUsed: boolean;
}

export interface PublicDealership {
  id: string;
  name: string;
  cityState: string;
  phone: string;
  address: string;
  maps: string;
}

export interface StorefrontResponse {
  storefront: PublicStorefront;
  dealerships: PublicDealership[];
  carts: PublicCart[];
}

export interface StorefrontCartResponse {
  storefront: PublicStorefront;
  dealership: PublicDealership | null;
  cart: PublicCart;
}

// Same-origin on the website (Hosting rewrite); absolute elsewhere (dev server, phone app).
const base = () => (typeof location !== 'undefined' && location.origin === PUBLIC_ORIGIN ? '' : PUBLIC_ORIGIN);

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`);
  if (res.status === 404) throw new Error('not_found');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchStorefront = (slug: string) => getJson<StorefrontResponse>(`/api/storefront/${encodeURIComponent(slug)}`);
export const fetchStorefrontCart = (slug: string, cartId: string) =>
  getJson<StorefrontCartResponse>(`/api/storefront/${encodeURIComponent(slug)}/${encodeURIComponent(cartId)}`);

export const money = (n: number) => (n > 0 ? `$${n.toLocaleString('en-US')}` : 'Call for price');
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
export const smsHref = (phone: string, body: string) => `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`;
