// Growth release — "Share everywhere" functions.
//   mpLink          GET /l/:code                 tracked short-link redirect (Hosting rewrite)
//   mpStorefrontApi GET /api/storefront/:slug[/:cartId]  public storefront JSON (Hosting rewrite)
// Both run in us-central1 to match the rewrites in firebase.json.
import * as logger from 'firebase-functions/logger';
import {onRequest} from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const PUBLIC_ORIGIN = 'https://tigon-iot.web.app';
const PHOTO_BASE = 'https://s3.amazonaws.com/prod.docs.s3/carts/';
const LINKS = 'mp_links';
const CLICKS = 'mp_clicks';
const CARTS = 'mp_carts';
const STOREFRONTS = 'mp_storefronts';
const SETTINGS = 'mp_settings/general';
const REGION = 'us-central1';

type Json = Record<string, any>;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 'Yes' || v === 'yes';
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'}[c]!));

/** Link-preview fetchers and crawlers: redirected, but not counted as clicks. */
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|preview|whatsapp\/|telegram|discord|embedly|skype|curl|wget|python-requests|headless/i;
const isBot = (ua: string) => !ua || BOT_RE.test(ua);

// ---------------------------------------------------------------------------
// Store info (copy of the essentials of frontend/src/mp/constants.ts DEALERSHIPS)
// ---------------------------------------------------------------------------

export interface Store {id: string; name: string; cityState: string; phone: string; address: string; maps: string}

export const STORES: Store[] = [
  {id: 'T0', name: 'TIGON National', cityState: '', phone: '1-844-844-6638', address: '', maps: 'https://www.google.com/maps?cid=913687030872245288'},
  {id: 'T1', name: 'Hatfield PA', cityState: 'Hatfield, PA', phone: '215-595-8736', address: '2333 Bethlehem Pike, Hatfield, PA 19440', maps: 'https://www.google.com/maps?cid=8221925612164093496'},
  {id: 'T2', name: 'Ocean View NJ', cityState: 'Ocean View, NJ', phone: '609-840-0404', address: '101 NJ-50, Ocean View, NJ 08230', maps: 'https://www.google.com/maps?cid=6446924254429489274'},
  {id: 'T3', name: 'Long Pond PA', cityState: 'Long Pond, PA', phone: '570-580-0567', address: '4738 PA-115, Long Pond, PA 18334', maps: 'https://www.google.com/maps?cid=11714838830522733253'},
  {id: 'T4', name: 'Dover DE', cityState: 'Dover, DE', phone: '302-546-0010', address: '5158 N Dupont Hwy, Dover, DE 19901', maps: 'https://www.google.com/maps?cid=12843447677705895190'},
  {id: 'T5', name: 'Scranton-Wilkes-Barre PA', cityState: 'Scranton, PA', phone: '570-344-4443', address: '1225 N Keyser Ave #2, Scranton, PA 18504', maps: 'https://www.google.com/maps?cid=13243686786001524416'},
  {id: 'T6', name: 'Raleigh NC', cityState: 'Raleigh, NC', phone: '984-489-0296', address: '2700 S Wilmington St, Raleigh, NC 27603', maps: 'https://www.google.com/maps?cid=14570072271497929915'},
  {id: 'T7', name: 'South Bend IN', cityState: 'South Bend, IN', phone: '574-703-0456', address: '52129 State Road 933, South Bend, IN 46637', maps: 'https://www.google.com/maps?cid=17532455648086849827'},
  {id: 'T8', name: 'Gloucester Point VA', cityState: 'Gloucester Point, VA', phone: '804-792-0234', address: '2810 George Washington Memorial Hwy, Gloucester Point, VA 23072', maps: 'https://www.google.com/maps?cid=16682967888503617377'},
  {id: 'T9', name: 'Bayville NJ', cityState: 'Bayville, NJ', phone: '732-908-7166', address: '155 Atlantic City Blvd, Bayville, NJ 08721', maps: 'https://www.google.com/maps?cid=16812778070531162551'},
  {id: 'T10', name: 'Waretown NJ', cityState: 'Waretown, NJ', phone: '732-998-8146', address: '526 US-9, Waretown, NJ 08758', maps: 'https://www.google.com/maps?cid=11595558320608622005'},
  {id: 'T11', name: 'Orangeburg SC', cityState: 'Orangeburg, SC', phone: '803-596-0246', address: '4166 North Rd, Orangeburg, SC 29118', maps: 'https://www.google.com/maps?cid=17192321019507936230'},
  {id: 'T12', name: 'Lecanto FL', cityState: 'Lecanto, FL', phone: '352-453-0345', address: '299 E. Gulf to Lake Hwy, Lecanto, FL 34461', maps: 'https://www.google.com/maps?cid=4773802157529013859'},
  {id: 'T13', name: 'Swanton OH', cityState: 'Swanton, OH', phone: '419-402-8400', address: '10420 Airport Hwy, Swanton, OH 43558', maps: 'https://www.google.com/maps?cid=16517552730289967239'},
  {id: 'T14', name: 'Rio Grande NJ', cityState: 'Rio Grande, NJ', phone: '609-551-0234', address: '1304 NJ-47 b, Rio Grande, NJ 08242', maps: 'https://www.google.com/maps?cid=17469351422439742131'},
];
export const STORE_BY_ID: Record<string, Store> = Object.fromEntries(STORES.map((s) => [s.id, s]));
const NATIONAL_PHONE = STORE_BY_ID.T0.phone;
const city = (id: string) => (STORE_BY_ID[id]?.cityState || '').split(',')[0];
const locName = (id: string) => STORE_BY_ID[id]?.cityState || STORE_BY_ID[id]?.name || id || 'Other';

// ---------------------------------------------------------------------------
// Public cart mapper (DMS payload → public fields only; no serial/VIN/invoice)
// ---------------------------------------------------------------------------

/** Public cart as returned by mpStorefrontApi (mirrors frontend/src/storefront/api.ts PublicCart). */
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
  /** Walk-around videos (Firebase Storage download URLs). */
  videos: string[];
}

const photoUrl = (f: string) => (/^https?:\/\//i.test(f) ? f : PHOTO_BASE + f);
const cleanList = (a: unknown) => (Array.isArray(a) ? a : []).map(str).filter((s) => s && !/^null$/i.test(s));

function isUsedPayload(p: Json): boolean {
  if (typeof p.isUsed === 'boolean') return p.isUsed;
  if (typeof p.isNew === 'boolean') return !p.isNew;
  const cond = str(p.condition || p.cartCondition);
  return cond ? !/^new/i.test(cond) : true;
}

function featureLines(p: Json, isUsed: boolean, isElectric: boolean): string[] {
  const attrs = obj(p.cartAttributes);
  const batt = obj(p.battery);
  const out: string[] = [isUsed ? 'Pre-owned' : 'Brand new'];
  if (bool(obj(p.title).isStreetLegal)) out.push('Street legal');
  if (bool(attrs.isLifted)) out.push('Lifted');
  const pass = parseInt(str(attrs.passengers).match(/\d+/)?.[0] || '0', 10);
  if (pass) out.push(`${pass} passenger`);
  if (isElectric) {
    const v = str(batt.packVoltage).replace(/\s*v(olt)?s?$/i, '');
    const type = str(batt.type);
    if (type || v) out.push([v && `${v}V`, /lith|lifepo|li-ion/i.test(type) ? 'lithium battery' : type ? `${type.toLowerCase()} battery` : 'battery'].filter(Boolean).join(' '));
    else out.push('Electric');
  } else {
    out.push(`Gas${str(obj(p.engine).make) ? ` · ${str(obj(p.engine).make)} engine` : ''}`);
  }
  const color = str(attrs.cartColor);
  const seat = str(attrs.seatColor);
  if (color) out.push(`${color} paint${seat ? ` with ${seat.toLowerCase()} seats` : ''}`);
  const rim = str(attrs.tireRimSize).replace(/"/g, '');
  if (rim) out.push(`${rim}" wheels${str(attrs.tireType) ? ` · ${str(attrs.tireType).toLowerCase()} tires` : ''}`);
  if (bool(attrs.hasExtendedTop)) out.push('Extended roof');
  if (bool(attrs.hasSoundSystem)) out.push('Sound system');
  if (bool(attrs.hasHitch)) out.push('Trailer hitch');
  out.push('Financing available');
  return out;
}

function parsePayload(data: Json): Json {
  try {
    const p = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload;
    return obj(p);
  } catch {
    return {};
  }
}

/** Maps an mp_carts doc to its public shape, or null when it must not be shown publicly. */
export function publicCart(id: string, data: Json): PublicCart | null {
  if (data.soldLocally === true) return null;
  const p = parsePayload(data);
  if (p.isInStock === false || str(p.status).toLowerCase() === 'sold' || bool(p.isDraft)) return null;
  if (/delete/i.test(str(data.payload))) return null;
  const type = obj(p.cartType);
  const attrs = obj(p.cartAttributes);
  const batt = obj(p.battery);
  const loc = obj(p.cartLocation);
  const isUsed = isUsedPayload(p);
  const isElectric = p.isElectric !== false;
  const locationId = str(loc.locationId) || str(loc.latestStoreId) || str(data.locationId) || 'Other';
  let photos = cleanList(p.imageUrls);
  if (!photos.length) photos = cleanList(p.internalCartImageUrls);
  if (!photos.length) photos = cleanList(p._mpDefaultImages);
  if (!photos.length) photos = cleanList(data.photoUrls);
  const make = str(type.make);
  const model = str(type.model);
  const color = str(attrs.cartColor);
  const year = str(type.year);
  const features = featureLines(p, isUsed, isElectric);
  const name = [year, make, model].filter(Boolean).join(' ') || 'Golf cart';
  const description = `${isUsed ? 'Pre-owned' : 'New'} ${name}${color ? ` in ${color.toLowerCase()}` : ''}. ` +
    `${features.slice(1, -1).map((f) => f.charAt(0).toLowerCase() + f.slice(1)).join(', ')}. Available at TIGON Golf Carts ${locName(locationId)}. Financing and delivery available.`;
  return {
    id,
    title: [make, model, color, city(locationId)].filter(Boolean).join(' ') || name,
    year, make, model, color,
    price: Number(p.retailPrice) || 0,
    isUsed,
    isElectric,
    passengers: parseInt(str(attrs.passengers).match(/\d+/)?.[0] || '0', 10),
    lifted: bool(attrs.isLifted),
    streetLegal: bool(obj(p.title).isStreetLegal),
    battery: isElectric ? [str(batt.packVoltage), str(batt.type)].filter(Boolean).join(' ') : '',
    locationId,
    location: locName(locationId),
    photos: photos.map(photoUrl),
    features,
    description: description.replace(/\.\s*\./g, '.').replace(/\s+/g, ' '),
    videos: cleanList(data.videos).filter((u) => /^https:\/\//i.test(u)),
  };
}

// Mapped in-stock carts are cached per instance for a couple of minutes (Hosting's CDN caches responses too).
let cartCache: {at: number; carts: PublicCart[]} | null = null;

export async function allPublicCarts(): Promise<PublicCart[]> {
  if (cartCache && Date.now() - cartCache.at < 120_000) return cartCache.carts;
  const snap = await admin.firestore().collection(CARTS).get();
  const carts: PublicCart[] = [];
  snap.forEach((d) => {
    const c = publicCart(d.id, d.data());
    if (c) carts.push(c);
  });
  cartCache = {at: Date.now(), carts};
  return carts;
}

// ---------------------------------------------------------------------------
// mpLink — tracked short-link redirect
// ---------------------------------------------------------------------------

function ogHtml(target: string, c: PublicCart): string {
  const title = esc(`${c.year ? c.year + ' ' : ''}${c.title}${c.price ? ` — $${c.price.toLocaleString('en-US')}` : ''}`);
  const desc = esc(c.description.slice(0, 280));
  const img = c.photos[0] ? `<meta property="og:image" content="${esc(c.photos[0])}">` : '';
  const t = esc(target);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
    `<meta property="og:type" content="product"><meta property="og:title" content="${title}">` +
    `<meta property="og:description" content="${desc}">${img}<meta property="og:url" content="${t}">` +
    '<meta name="twitter:card" content="summary_large_image">' +
    `<meta http-equiv="refresh" content="0;url=${t}"></head><body><a href="${t}">${title}</a></body></html>`;
}

/** GET /l/:code → counts the click (humans only) and 302-redirects to the link's target. */
export const mpLink = onRequest({region: REGION}, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const code = str(req.path.split('/').filter(Boolean).pop());
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) {
    res.redirect(302, PUBLIC_ORIGIN);
    return;
  }
  const db = admin.firestore();
  try {
    const ref = db.collection(LINKS).doc(code);
    const snap = await ref.get();
    if (!snap.exists) {
      res.redirect(302, PUBLIC_ORIGIN);
      return;
    }
    const link = snap.data() as Json;
    // Only redirect within the public site (no open redirects).
    const target = str(link.target).startsWith(`${PUBLIC_ORIGIN}/`) ? str(link.target) : PUBLIC_ORIGIN;
    const ua = str(req.get('user-agent'));
    if (isBot(ua) || req.method !== 'GET') {
      // Link previews (Facebook, X, iMessage…) get Open Graph tags for the cart, then the redirect.
      const cartDoc = link.cartId ? await db.collection(CARTS).doc(str(link.cartId)).get() : null;
      const c = cartDoc?.exists ? publicCart(cartDoc.id, cartDoc.data() || {}) : null;
      if (c) {
        res.status(200).type('html').send(ogHtml(target, c));
        return;
      }
      res.redirect(302, target);
      return;
    }
    const click: Json = {
      code,
      cartId: str(link.cartId),
      userId: str(link.userId),
      deviceId: str(link.deviceId),
      platform: str(link.platform) || 'other',
      ts: Date.now(),
      referrer: str(req.get('referer')).slice(0, 300),
      userAgent: ua.slice(0, 200),
    };
    if (link.variant) click.variant = link.variant;
    if (link.abTestId) click.abTestId = link.abTestId;
    const batch = db.batch();
    batch.update(ref, {clicks: admin.firestore.FieldValue.increment(1), lastClickAt: Date.now()});
    batch.set(db.collection(CLICKS).doc(), click);
    await batch.commit().catch((e) => logger.warn('mpLink: count failed', code, e));
    res.redirect(302, target);
  } catch (e) {
    logger.error('mpLink failed', code, e);
    res.redirect(302, PUBLIC_ORIGIN);
  }
});

// ---------------------------------------------------------------------------
// mpStorefrontApi — public storefront JSON
// ---------------------------------------------------------------------------

interface PublicStorefront {
  slug: string;
  title: string;
  tagline: string;
  phone: string;
  locationIds: string[];
  pinnedCartIds: string[];
  showNew: boolean;
  showUsed: boolean;
}

const DEFAULT_STOREFRONT: PublicStorefront = {
  slug: 'tigon',
  title: 'TIGON Golf Carts',
  tagline: 'New & pre-owned golf carts · financing & delivery available',
  phone: NATIONAL_PHONE,
  locationIds: [],
  pinnedCartIds: [],
  showNew: true,
  showUsed: true,
};

async function loadStorefront(slug: string): Promise<PublicStorefront | null> {
  const db = admin.firestore();
  const snap = await db.collection(STOREFRONTS).doc(slug).get();
  if (!snap.exists) return slug === 'tigon' ? DEFAULT_STOREFRONT : null;
  const d = snap.data() as Json;
  if (d.published !== true) return slug === 'tigon' ? DEFAULT_STOREFRONT : null;
  const locationIds = (Array.isArray(d.locationIds) ? d.locationIds : []).map(str).filter(Boolean);
  let phone = str(d.phone);
  if (!phone) {
    const settings = await db.doc(SETTINGS).get().catch(() => null);
    phone = str(settings?.get('defaultPhone')) || (locationIds.length === 1 ? STORE_BY_ID[locationIds[0]]?.phone || '' : '') || NATIONAL_PHONE;
  }
  return {
    slug,
    title: str(d.title) || 'TIGON Golf Carts',
    tagline: str(d.tagline),
    phone,
    locationIds,
    pinnedCartIds: (Array.isArray(d.pinnedCartIds) ? d.pinnedCartIds : []).map(str).filter(Boolean),
    showNew: d.showNew !== false,
    showUsed: d.showUsed !== false,
  };
}

function storefrontCarts(sf: PublicStorefront, carts: PublicCart[]): PublicCart[] {
  const pinned = new Map(sf.pinnedCartIds.map((id, i) => [id, i]));
  return carts
    .filter((c) => pinned.has(c.id) || (
      (!sf.locationIds.length || sf.locationIds.includes(c.locationId)) &&
      (c.isUsed ? sf.showUsed : sf.showNew)))
    .sort((a, b) => {
      const pa = pinned.get(a.id) ?? Infinity;
      const pb = pinned.get(b.id) ?? Infinity;
      if (pa !== pb) return pa - pb;
      if (a.isUsed !== b.isUsed) return a.isUsed ? -1 : 1;
      return b.price - a.price;
    });
}

const storesFor = (ids: string[]) => ids.map((id) => STORE_BY_ID[id]).filter(Boolean);

/** GET /api/storefront/:slug → storefront + carts; GET /api/storefront/:slug/:cartId → one cart. */
export const mpStorefrontApi = onRequest({region: REGION}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({error: 'GET only'});
    return;
  }
  const parts = req.path.split('/').filter(Boolean);
  const i = parts.indexOf('storefront');
  const slug = str(parts[i >= 0 ? i + 1 : 0]).toLowerCase();
  const cartId = str(parts[i >= 0 ? i + 2 : 1]);
  if (!/^[a-z0-9-]{3,40}$/.test(slug) || (cartId && !/^[A-Za-z0-9_-]{1,128}$/.test(cartId))) {
    res.set('Cache-Control', 'public, max-age=60');
    res.status(404).json({error: 'Not found'});
    return;
  }
  try {
    const sf = await loadStorefront(slug);
    if (!sf) {
      res.set('Cache-Control', 'public, max-age=60');
      res.status(404).json({error: 'Storefront not found'});
      return;
    }
    res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    const {pinnedCartIds: _pinned, ...storefront} = sf;
    void _pinned;
    if (cartId) {
      const snap = await admin.firestore().collection(CARTS).doc(cartId).get();
      const cart = snap.exists ? publicCart(snap.id, snap.data() || {}) : null;
      if (!cart) {
        res.set('Cache-Control', 'public, max-age=60');
        res.status(404).json({error: 'This cart is no longer available', storefront});
        return;
      }
      res.json({storefront, dealership: STORE_BY_ID[cart.locationId] || null, cart});
      return;
    }
    const carts = storefrontCarts(sf, await allPublicCarts());
    const locIds = sf.locationIds.length ? sf.locationIds : [...new Set(carts.map((c) => c.locationId))];
    res.json({storefront, dealerships: storesFor(locIds), carts});
  } catch (e) {
    logger.error('mpStorefrontApi failed', slug, e);
    res.set('Cache-Control', 'no-store');
    res.status(500).json({error: 'Something went wrong'});
  }
});
