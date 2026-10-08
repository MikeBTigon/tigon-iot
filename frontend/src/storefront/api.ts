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
  /** Filters and photo ranking (missing on older responses). */
  utility?: boolean;
  allTerrain?: boolean;
  stockPhotos?: boolean;
}

export type WeekDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
/** Open hours for one day ("09:00"–"18:00"); null = closed. */
export type StoreHours = Record<WeekDay, { open: string; close: string } | null>;

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
  hours?: StoreHours | null;
}

export interface StorefrontCartResponse {
  storefront: PublicStorefront;
  dealership: PublicDealership | null;
  cart: PublicCart;
  hours?: StoreHours | null;
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

/** 0 = the cart's own photos, 1 = stock images, 2 = no picture (lower shows first). */
export const photoRank = (c: PublicCart) => (!c.photos.length ? 2 : c.stockPhotos ? 1 : 0);

const DAYS: Array<[WeekDay, string]> = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const time12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Store hours grouped by matching days: ["Mon–Fri 9 AM–6 PM", "Sat 9 AM–4 PM", "Sun Closed"]. */
export function hoursLines(hours: StoreHours | null | undefined): string[] {
  if (!hours) return [];
  const label = (d: WeekDay) => (hours[d] ? `${time12(hours[d]!.open)}–${time12(hours[d]!.close)}` : 'Closed');
  const out: string[] = [];
  for (let i = 0; i < DAYS.length;) {
    let j = i;
    while (j + 1 < DAYS.length && label(DAYS[j + 1][0]) === label(DAYS[i][0])) j++;
    out.push(`${DAYS[i][1]}${j > i ? `–${DAYS[j][1]}` : ''} ${label(DAYS[i][0])}`);
    i = j + 1;
  }
  return out;
}
