import type { Cart, MpAccount, MpCart, MpCartDoc } from './types';
import { mapDmsCartObject, isDmsCartObject, hasDeleteFlag, photoUrl } from './cartLogic';
import { ACCOUNT_GROUPS, locationName, locationRank } from './constants';

type Json = Record<string, unknown>;

const EMPTY_CART: Cart = {
  id: '', dmsId: '', make: '', model: '', year: '', color: '', seatColor: '', driveTrain: '',
  tireRimSize: '', tireType: '', hasSoundSystem: false, isLifted: false, hasHitch: false,
  hasExtendedTop: false, passengers: 0, isElectric: true, isUsed: true, isStreetLegal: false,
  batteryType: '', packVoltage: '', batteryBrand: '', batteryYear: '', engineMake: '',
  locationId: 'Other', price: 0, cartWarranty: '', batteryWarranty: '', serial: '', vin: '',
  invoice: '', status: '', isDraft: false, isRFS: false, photos: [], photoSource: 'none',
  inStock: true, windowSticker: '', flaggedDelete: false,
};

/** Accepts raw DMS docs as well as the legacy app's payload shapes. */
function cartFromPayload(payload: unknown): Cart {
  if (isDmsCartObject(payload)) return mapDmsCartObject(payload as Json);
  const p = (payload && typeof payload === 'object' ? payload : {}) as Json;
  for (const key of ['raw', 'doc', 'dmsDoc', 'dms', 'source']) {
    if (isDmsCartObject(p[key])) return mapDmsCartObject(p[key] as Json);
  }
  const mapped = (p.cart && typeof p.cart === 'object' ? p.cart : p) as Partial<Cart>;
  return { ...EMPTY_CART, ...mapped, photos: Array.isArray(mapped.photos) ? mapped.photos : [], flaggedDelete: hasDeleteFlag(p) };
}

export function cartFromDoc(docId: string, data: Partial<MpCartDoc>): MpCart {
  let parsed: unknown = {};
  try {
    parsed = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload || {};
  } catch {
    parsed = {};
  }
  const cart = cartFromPayload(parsed);
  return {
    ...cart,
    id: cart.id || docId,
    dmsId: cart.dmsId || data.dmsId || docId,
    serial: cart.serial || data.serial || '',
    locationId: cart.locationId && cart.locationId !== 'Other' ? cart.locationId : data.locationId || cart.locationId,
    docId,
    savedAt: Number(data.savedAt) || 0,
    postedBy: data.postedBy || {},
    postedAccounts: data.postedAccounts || {},
    source: data.source,
    createdBy: data.createdBy,
    soldLocally: data.soldLocally === true,
  };
}

// ---------------------------------------------------------------------------
// Posted status
// ---------------------------------------------------------------------------

export function postedTs(cart: MpCart, userKeys: string[]): number {
  return Math.max(0, ...userKeys.map((k) => cart.postedBy[k] || 0));
}

export const isPostedBy = (cart: MpCart, userKeys: string[]) => postedTs(cart, userKeys) > 0;

export const postedAccountCount = (cart: MpCart) => Object.keys(cart.postedAccounts).length;

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export function workingPhotos(cart: Cart, broken: Set<string>): string[] {
  return cart.photos.filter((p) => !broken.has(photoUrl(p)));
}

export function hasPhotoIssue(cart: Cart, broken: Set<string>): boolean {
  return cart.photos.some((p) => broken.has(photoUrl(p)));
}

/** 3+ photos = 3, 2 = 2, 1 = 1, none / all broken = -1. */
export function photoRank(cart: Cart, broken: Set<string>): number {
  const n = workingPhotos(cart, broken).length;
  if (n >= 3) return 3;
  return n > 0 ? n : -1;
}

/** Used first → photo rank → price high to low. */
export function masterSort<T extends Cart>(carts: T[], broken: Set<string>): T[] {
  return carts.slice().sort((a, b) => {
    if (a.isUsed !== b.isUsed) return a.isUsed ? -1 : 1;
    const pr = photoRank(b, broken) - photoRank(a, broken);
    if (pr) return pr;
    return b.price - a.price;
  });
}

/** Home queue: unposted by me, has photos, balanced round-robin across stores. */
export function suggestedQueue(carts: MpCart[], userKeys: string[], broken: Set<string>, max = 60): MpCart[] {
  const pool = masterSort(
    carts.filter((c) => !c.flaggedDelete && !isPostedBy(c, userKeys) && photoRank(c, broken) > 0),
    broken,
  );
  const byLoc = new Map<string, MpCart[]>();
  for (const c of pool) {
    const list = byLoc.get(c.locationId) || [];
    list.push(c);
    byLoc.set(c.locationId, list);
  }
  const queues = [...byLoc.entries()].sort((a, b) => locationRank(a[0]) - locationRank(b[0])).map(([, l]) => l);
  // Round-robin within each tier (used / photo rank) so the top of the list stays used + photo-rich.
  const out: MpCart[] = [];
  while (out.length < max && queues.some((q) => q.length)) {
    const heads = queues.filter((q) => q.length).map((q) => q[0]);
    const best = masterSort(heads, broken)[0];
    const tier = (c: MpCart) => `${c.isUsed}|${photoRank(c, broken)}`;
    for (const q of queues) {
      if (q.length && tier(q[0]) === tier(best) && out.length < max) out.push(q.shift()!);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function matchesSearch(cart: Cart, q: string): boolean {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = [
    cart.make, cart.model, cart.year, cart.color, cart.seatColor, cart.serial, cart.vin,
    cart.locationId, locationName(cart.locationId), cart.batteryType, cart.isUsed ? 'used' : 'new',
  ].join(' ').toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export function formatPrice(p: number): string {
  return p > 0 ? `$${p.toLocaleString('en-US')}` : 'No price';
}

export function timeAgo(ts: number): string {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function groupAccounts(accounts: MpAccount[]): Array<[string, MpAccount[]]> {
  const groups = new Map<string, MpAccount[]>();
  for (const g of ACCOUNT_GROUPS) groups.set(g, []);
  for (const a of accounts) {
    const g = a.group || 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(a);
  }
  return [...groups.entries()].filter(([, list]) => list.length);
}
