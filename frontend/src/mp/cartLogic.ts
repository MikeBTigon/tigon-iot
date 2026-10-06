// Tigon MP Assistant — shared cart mapping + listing generation.
// Also bundled into the Chrome extensions (see `npm run build:mp-ext`), so keep it
// free of React / Firebase imports.

import type { Cart, Listing, ListingFormat } from './types';
import { PHOTO_BASE, PHOTO_WORKER, WINDOW_STICKER_BASE, locationCity, locationName } from './constants';

export { locationName, locationCity };

type Json = Record<string, unknown>;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 'Yes' || v === 'yes';
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

// ---------------------------------------------------------------------------
// DMS mapping
// ---------------------------------------------------------------------------

/** True when an object looks like a DMS cart record. */
export function isDmsCartObject(v: unknown): boolean {
  const o = obj(v);
  const hasShape = 'cartType' in o || 'cartAttributes' in o;
  return (typeof o._id === 'string' && (hasShape || 'serialNo' in o)) || (hasShape && !!str(o.serialNo));
}

/** Recursively finds the first DMS cart-shaped object inside a parsed API response. */
export function findDmsCartObject(v: unknown, depth = 0): Json | null {
  if (depth > 6 || !v || typeof v !== 'object') return null;
  if (isDmsCartObject(v)) return v as Json;
  const values = Array.isArray(v) ? v : Object.values(v as Json);
  for (const child of values) {
    const found = findDmsCartObject(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Collects every DMS cart-shaped object in a response (for `carts/lookup` batches). */
export function findAllDmsCartObjects(v: unknown, out: Json[] = [], depth = 0): Json[] {
  if (depth > 6 || !v || typeof v !== 'object') return out;
  if (isDmsCartObject(v)) {
    out.push(v as Json);
    return out;
  }
  const values = Array.isArray(v) ? v : Object.values(v as Json);
  for (const child of values) findAllDmsCartObjects(child, out, depth + 1);
  return out;
}

export function hasDeleteFlag(doc: unknown): boolean {
  try {
    return /delete/i.test(JSON.stringify(doc));
  } catch {
    return false;
  }
}

function parsePassengers(v: unknown): number {
  const m = str(v).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function photoList(doc: Json): { photos: string[]; source: Cart['photoSource'] } {
  const clean = (a: unknown) =>
    (Array.isArray(a) ? a : []).map(str).filter((s) => s && !/^null$/i.test(s));
  const pub = clean(doc.imageUrls);
  if (pub.length) return { photos: pub, source: 'public' };
  const internal = clean(doc.internalCartImageUrls);
  if (internal.length) return { photos: internal, source: 'internal' };
  // New carts without photos: default web images resolved by the DMS sync (full URLs).
  const defaults = clean(doc._mpDefaultImages);
  if (defaults.length) return { photos: defaults, source: 'default' };
  return { photos: [], source: 'none' };
}

export function isLithium(batteryType: string): boolean {
  return /lith|lifepo|li-ion/i.test(batteryType);
}

/** Warranty from DMS fields first, then Tigon's fallback rules. */
export function resolveWarranty(doc: Json, isUsed: boolean, isElectric: boolean): { cart: string; battery: string } {
  const batt = obj(doc.battery);
  const battType = str(batt.type);
  const lithium = isLithium(battType);
  const battYear = parseInt(str(batt.year), 10);
  const newBattery = !!battYear && battYear >= new Date().getFullYear() - 1;

  let cart: string;
  let battery: string;
  if (!isUsed && lithium) {
    cart = '2 year';
    battery = '8 year';
  } else if (!isUsed) {
    cart = '1 year';
    battery = '1 year';
  } else if (isElectric && !lithium && newBattery) {
    cart = '90 day';
    battery = '1 year';
  } else {
    cart = '90 day';
    battery = '90 day';
  }
  return {
    cart: str(doc.warrantyLength) || cart,
    battery: isElectric ? str(batt.warrantyLength) || battery : '',
  };
}

function windowStickerUrl(doc: Json): string {
  for (const [k, v] of Object.entries(doc)) {
    if (!/sticker|monroney/i.test(k)) continue;
    const file = Array.isArray(v) ? str(v[0]) : str(v);
    if (file && !/^(null|undefined)$/i.test(file)) return /^https?:\/\//i.test(file) ? file : WINDOW_STICKER_BASE + file;
  }
  return '';
}

/** Default web-image file names for a new cart: color-make-model-in-{location}-N.jpg. */
export function defaultImageFiles(doc: Json, locationSlug: string, count = 4): string[] {
  const s = (v: unknown) => str(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const type = obj(doc.cartType);
  const stem = [s(obj(doc.cartAttributes).cartColor), s(type.make), s(type.model)].filter(Boolean).join('-');
  return Array.from({ length: count }, (_, i) => `${stem}-in-${locationSlug}-${i + 1}.jpg`);
}

/** DMS flag first; the website API may express condition differently. */
export function isUsedCart(doc: Json): boolean {
  if (typeof doc.isUsed === 'boolean') return doc.isUsed;
  if (typeof doc.isNew === 'boolean') return !doc.isNew;
  const cond = str(doc.condition || doc.cartCondition);
  if (cond) return !/^new/i.test(cond);
  return true;
}

export function mapDmsCartObject(doc: Json): Cart {
  const type = obj(doc.cartType);
  const attrs = obj(doc.cartAttributes);
  const batt = obj(doc.battery);
  const engine = obj(doc.engine);
  const loc = obj(doc.cartLocation);
  const title = obj(doc.title);
  const rfs = obj(doc.rfsStatus);
  const isUsed = isUsedCart(doc);
  const isElectric = doc.isElectric !== false;
  const warranty = resolveWarranty(doc, isUsed, isElectric);
  const { photos, source } = photoList(doc);
  const price = Number(doc.retailPrice) || 0;

  return {
    id: str(doc._id) || str(doc.serialNo),
    dmsId: str(doc._id) || str(doc.serialNo),
    make: str(type.make),
    model: str(type.model),
    year: str(type.year),
    color: str(attrs.cartColor),
    seatColor: str(attrs.seatColor),
    driveTrain: str(attrs.driveTrain),
    tireRimSize: str(attrs.tireRimSize),
    tireType: str(attrs.tireType),
    hasSoundSystem: bool(attrs.hasSoundSystem),
    isLifted: bool(attrs.isLifted),
    hasHitch: bool(attrs.hasHitch),
    hasExtendedTop: bool(attrs.hasExtendedTop),
    passengers: parsePassengers(attrs.passengers),
    isElectric,
    isUsed,
    isStreetLegal: bool(title.isStreetLegal),
    batteryType: str(batt.type),
    packVoltage: str(batt.packVoltage),
    batteryBrand: str(batt.brand),
    batteryYear: str(batt.year),
    engineMake: str(engine.make),
    locationId: str(loc.locationId) || str(loc.latestStoreId) || 'Other',
    price,
    cartWarranty: warranty.cart,
    batteryWarranty: warranty.battery,
    serial: str(doc.serialNo),
    vin: str(doc.vinNo),
    invoice: str(doc.invoiceNo),
    status: str(doc.status),
    isDraft: bool(doc.isDraft),
    isRFS: bool(rfs.isRFS),
    photos,
    photoSource: source,
    inStock: doc.isInStock !== false,
    windowSticker: windowStickerUrl(doc),
    flaggedDelete: hasDeleteFlag(doc),
  };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export function photoUrl(file: string): string {
  return /^https?:\/\//i.test(file) ? file : PHOTO_BASE + file;
}

function photoFileName(file: string): string {
  return file.split('/').pop()!.split('?')[0];
}

/** Download URL via the Cloudflare worker (forces Content-Disposition: attachment). */
export function photoDownloadUrl(file: string, downloadName?: string): string {
  // The worker only proxies cart photos; other images (default web images) download directly.
  if (/^https?:\/\//i.test(file) && !file.startsWith(PHOTO_BASE)) return file;
  const name = photoFileName(file);
  const q = new URLSearchParams({ file: name });
  if (downloadName) q.set('name', downloadName);
  return `${PHOTO_WORKER}?${q.toString()}`;
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Listing text
// ---------------------------------------------------------------------------

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function normalizeColor(c: string): string {
  return c.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** DMS fill-ins that aren't a real make or model ("Other", "N/A", ...). */
export function isPlaceholder(v: string): boolean {
  return /^(other|others|n\/?a|none|unknown|tbd|-+|\.)$/i.test((v || '').trim());
}

/** Words that describe the cart, used in place of a model of "Other": "Lifted 6 Passenger Cart", "Gas Golf Cart". */
export function cartKind(cart: Cart): string {
  const parts: string[] = [];
  if (cart.isLifted) parts.push('Lifted');
  if (cart.passengers) parts.push(`${cart.passengers} Passenger`);
  if (parts.length) return `${parts.join(' ')} Cart`;
  if (cart.isStreetLegal) return 'Street Legal Golf Cart';
  if (!cart.isElectric) return 'Gas Golf Cart';
  if (isLithium(cart.batteryType)) return 'Lithium Golf Cart';
  return 'Golf Cart';
}

/** Make for listings: '' when the DMS says "Other". */
export function displayMake(cart: Cart): string {
  return isPlaceholder(cart.make) ? '' : cart.make;
}

/** Model for listings and the Facebook Model field: describes the cart when the DMS says "Other". */
export function displayModel(cart: Cart): string {
  return isPlaceholder(cart.model) ? cartKind(cart) : cart.model;
}

export function cartName(cart: Cart): string {
  return [cart.year, displayMake(cart), displayModel(cart)].filter(Boolean).join(' ') || 'Golf Cart';
}

/** Website-style name: Make + Model + Cart Color + Location. */
export function cartTitle(cart: Cart): string {
  return [displayMake(cart), displayModel(cart), cart.color, locationCity(cart.locationId)].filter(Boolean).join(' ') || cartName(cart);
}

function formatWarranty(w: string): string {
  const t = w.trim();
  if (!t) return '';
  return /warranty/i.test(t) ? t : `${t} warranty`;
}

function priceText(p: number): string {
  return p > 0 ? `$${p.toLocaleString('en-US')}` : '';
}

function voltage(v: string): string {
  return v ? v.replace(/\s*v(olt)?s?$/i, '') + 'V' : '';
}

/** Descriptors that read naturally before the cart name ("lifted 4 passenger"). */
function descriptors(cart: Cart): string[] {
  const d: string[] = [];
  if (cart.isStreetLegal) d.push('street legal');
  if (cart.isLifted) d.push('lifted');
  if (cart.passengers) d.push(`${cart.passengers} passenger`);
  if (!cart.isElectric) d.push('gas');
  return d;
}

/** Equipment as noun phrases ("a 48V lithium battery"). */
function equipment(cart: Cart): string[] {
  const e: string[] = [];
  if (cart.isElectric && isLithium(cart.batteryType)) e.push(`a ${voltage(cart.packVoltage)} lithium battery`.replace('a  ', 'a '));
  else if (cart.isElectric && cart.packVoltage) e.push(`a ${voltage(cart.packVoltage)} battery pack`);
  if (!cart.isElectric && cart.engineMake) e.push(`a ${cart.engineMake} engine`);
  if (cart.color) e.push(`${normalizeColor(cart.color)} paint${cart.seatColor ? ` with ${normalizeColor(cart.seatColor)} seats` : ''}`);
  else if (cart.seatColor) e.push(`${normalizeColor(cart.seatColor)} seats`);
  if (cart.tireRimSize) e.push(`${cart.tireRimSize.replace(/"/g, '')}" wheels${cart.tireType ? ` with ${cart.tireType.toLowerCase()} tires` : ''}`);
  else if (cart.tireType) e.push(`${cart.tireType.toLowerCase()} tires`);
  if (cart.hasExtendedTop) e.push('an extended roof');
  if (cart.hasSoundSystem) e.push('a sound system');
  if (cart.hasHitch) e.push('a trailer hitch');
  if (cart.driveTrain && !/^(2wd|2x4)$/i.test(cart.driveTrain)) e.push(cart.driveTrain.toUpperCase());
  return e;
}

/** Stacked list lines, most notable first. */
function features(cart: Cart): string[] {
  const lines = descriptors(cart).map((d) => (d === 'gas' ? 'Gas powered' : cap(d)));
  for (const e of equipment(cart)) lines.push(cap(e.replace(/^(a|an) /, '')));
  return lines;
}

export function buildTitles(cart: Cart, rng: () => number): [string, string] {
  const adjectives = cart.isUsed
    ? ['Well Kept', 'Clean', 'Great Shape', 'Nice', 'Sharp', 'Ready to Ride']
    : ['New', 'Brand New', 'Like New', 'New Model'];
  const nouns: string[] = [];
  if (cart.isStreetLegal) nouns.push('Street Legal Cart', 'Street Legal Golf Cart', 'LSV');
  if (cart.isLifted) nouns.push('Lifted Golf Cart', 'Lifted Cart');
  if (cart.isElectric && isLithium(cart.batteryType)) nouns.push('Lithium Cart', 'Lithium Golf Cart');
  if (!cart.isElectric) nouns.push('Gas Golf Cart', 'Gas Cart');
  if (cart.passengers >= 6) nouns.push(`${cart.passengers} Seater Golf Cart`);
  else if (cart.passengers === 4) nouns.push('4 Seater Golf Cart', '4 Passenger Cart');
  nouns.push('Golf Cart');

  const a1 = pick(rng, adjectives);
  const n1 = pick(rng, nouns);
  let title1 = cart.isUsed || a1 !== 'New' ? `${a1} ${n1}` : `New ${n1}`;
  title1 = title1.replace(/\bNew New\b/, 'New');

  const name = cartName(cart);
  const power = cart.isElectric ? (isLithium(cart.batteryType) ? 'Lithium' : 'Electric') : 'Gas';
  const t2opts = [
    `${name}${cart.color ? ' - ' + normalizeColor(cart.color).replace(/\b\w/g, (c) => c.toUpperCase()) : ''}`,
    isPlaceholder(cart.model)
      ? [cart.year, displayMake(cart), cartKind(cart).includes(power) ? '' : power, cartKind(cart)].filter(Boolean).join(' ')
      : `${name} ${power}`,
    isPlaceholder(cart.model)
      ? `${displayMake(cart)} ${cartKind(cart)}`.trim()
      : `${displayMake(cart) || 'Golf'} ${cart.model || 'Cart'}${cart.isLifted ? ' Lifted' : ''}${cart.passengers ? ` ${cart.passengers} Pass` : ''}`.trim(),
  ];
  return [title1, pick(rng, t2opts)];
}

function warrantyLines(cart: Cart, rng: () => number): string[] {
  const lines: string[] = [];
  const cw = formatWarranty(cart.cartWarranty);
  const bw = formatWarranty(cart.batteryWarranty);
  if (cw) lines.push(pick(rng, [`Comes with a ${cw} on the cart`, `${cap(cw)} on the cart`, `Cart has a ${cw}`]));
  if (bw) lines.push(pick(rng, [`${cap(bw)} on the battery`, `Battery comes with a ${bw}`, `Battery has a ${bw}`]));
  return lines;
}

export const GOLF_CART_HEADLINE = 'Golf Cart for Sale';

const FINANCING = [
  'Financing available',
  'Financing available, easy approval',
  'We offer financing',
  'Financing options available',
];
const DELIVERY = [
  'Delivery available',
  'We can deliver',
  'Delivery available for a fee',
  'Local delivery available',
];
const OPENERS_USED = [
  'This one is in great shape and ready to go.',
  'Really nice cart, runs and drives great.',
  'Well taken care of and ready for the season.',
  'Clean cart, everything works like it should.',
];
const OPENERS_NEW = [
  'Brand new and ready to go.',
  'New cart, fully loaded and ready to ride.',
  'New in stock, come check it out.',
];

function listDescription(cart: Cart): string[] {
  const out: string[] = [cartName(cart)];
  const p = priceText(cart.price);
  if (p) out.push(p);
  for (const f of features(cart)) out.push(cap(f));
  return out;
}

function paragraphDescription(cart: Cart, rng: () => number): string[] {
  const name = cartName(cart);
  // Skip descriptors the name already says ("Lifted 6 Passenger Cart" in place of a model of "Other").
  const desc = descriptors(cart).filter((d) => !name.toLowerCase().includes(d));
  const eq = equipment(cart);
  const sentences: string[] = [pick(rng, cart.isUsed ? OPENERS_USED : OPENERS_NEW)];
  const subject = [...desc, name].join(' ');
  const article = /^[aeiou8]/i.test(subject) ? 'an' : 'a';
  const head = eq.slice(0, 2);
  const tail = eq.slice(2);
  sentences.push(
    head.length
      ? `${pick(rng, ["It's", 'This is', 'Up for sale is'])} ${article} ${subject} ${pick(rng, ['with', 'that has', 'featuring'])} ${joinList(head)}.`
      : `${pick(rng, ["It's", 'This is'])} ${article} ${subject}.`,
  );
  if (tail.length) sentences.push(`${pick(rng, ['Also has', 'It also has', 'Comes with'])} ${joinList(tail)}.`);
  const p = priceText(cart.price);
  if (p) sentences.push(pick(rng, [`Asking ${p}.`, `Price is ${p}.`, `${p}.`]));
  return [sentences.join(' ')];
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Applies ~3 subtle, human-looking imperfections. */
function addImperfections(text: string, rng: () => number, count = 3): string {
  const ops: Array<(s: string) => string> = [
    (s) => s.replace(/, (?=[a-z])/, ' '),
    (s) => s.replace(/ and /, ' & '),
    (s) => s.replace(/([.!]\s+|\n)([A-Z])([a-z])/, (_m, sep, c, r) => `${sep}${c.toLowerCase()}${r}`),
    (s) => s.replace(/\.(\n|$)/, '$1'),
  ];
  let out = text;
  for (const op of shuffle(rng, ops).slice(0, count)) out = op(out);
  return out;
}

export interface ListingOptions {
  format?: ListingFormat;
  seed?: number;
  variant?: number;
}

export function generateListing(cart: Cart, opts: ListingOptions = {}): Listing {
  const seed = (opts.seed ?? hashString(cart.id)) + (opts.variant ?? 0) * 7919;
  const rng = seededRandom(seed);
  const format: ListingFormat = opts.format ?? (rng() < 0.5 ? 'list' : 'paragraph');
  const [title1, title2] = buildTitles(cart, rng);

  const body = format === 'list' ? listDescription(cart) : paragraphDescription(cart, rng);
  const tail = [...warrantyLines(cart, rng), pick(rng, FINANCING), pick(rng, DELIVERY)];
  const main = format === 'list' ? [...body, ...tail].join('\n') : `${body.join(' ')}\n\n${tail.join('\n')}`;
  const loc = locationName(cart.locationId);
  const locationLine = /,/.test(loc) ? loc : '';
  // "Golf Cart" always leads the description (Marketplace search and preview).
  let description = `${GOLF_CART_HEADLINE}\n\n${addImperfections(main, rng)}`;
  if (locationLine) description += `\n\n${locationLine}`;
  return { title1, title2, description, format };
}

/** Per-user seed so different users get different wording on the same cart. */
export function userSeed(cartId: string, userId: string): number {
  return hashString(`${cartId}::${userId}`);
}

/** Five variations: an even 3/2 split between paragraph and list, shuffled. */
export function generateVariations(cart: Cart, userId = ''): Listing[] {
  const seed = userSeed(cart.id, userId);
  const rng = seededRandom(seed);
  const threeParagraph = rng() < 0.5;
  const formats: ListingFormat[] = threeParagraph
    ? ['paragraph', 'paragraph', 'paragraph', 'list', 'list']
    : ['list', 'list', 'list', 'paragraph', 'paragraph'];
  return shuffle(rng, formats).map((format, i) => generateListing(cart, { seed, variant: i + 1, format }));
}
