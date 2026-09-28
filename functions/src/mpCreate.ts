// Growth release — Create listings track.
//  - mpAiSnap: AI "snap-to-list" (photos and/or dictated text → structured cart fields).
//  - mpRunImport / mpImportScheduled: bulk import from WooCommerce, Shopify, JSON feeds and CSV URLs
//    into mp_carts (docs imp_{integrationId}_{sourceId}, source 'import:<integrationId>').
// Requires the ANTHROPIC_API_KEY secret for mpAiSnap only (same as mpAiListing).
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {createHash} from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

// Secret referenced by name (not defineSecret) so merely loading this file never makes a deploy
// look the secret up; it is only bound to the AI function when that function is exported.
const ANTHROPIC_SECRET = 'ANTHROPIC_API_KEY';

const MODEL = 'claude-opus-5';
const USERS = 'mp_users';
const CARTS = 'mp_carts';
const INTEGRATIONS = 'mp_integrations';
const SECRETS = 'mp_integration_secrets';
const AUDIT = 'mp_audit';

type Json = Record<string, unknown>;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

/** Trim, collapse whitespace, strip control chars, cap length. */
function cleanStr(v: unknown, max = 60): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanNum(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

const cleanBool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

async function roleOf(uid: string): Promise<string | null> {
  const snap = await admin.firestore().collection(USERS).doc(uid).get();
  return snap.exists ? str(snap.get('role')) || 'sales' : null;
}

// ===========================================================================
// mpAiSnap
// ===========================================================================

const CATEGORIES = ['golf cart', 'utility', 'accessory', 'part', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

/** Result of mpAiSnap. Unknown values are null. */
export interface AiSnapResult {
  make: string | null;
  model: string | null;
  year: string | null;
  color: string | null;
  seatColor: string | null;
  passengers: number | null;
  isElectric: boolean | null;
  batteryType: string | null;
  isLifted: boolean | null;
  isStreetLegal: boolean | null;
  hasSoundSystem: boolean | null;
  hasExtendedTop: boolean | null;
  isUsed: boolean | null;
  category: Category;
  title: string;
  description: string;
  suggestedPrice: number | null;
  priceReason: string;
}

interface Comparable {
  make: string;
  model: string;
  year: string;
  price: number;
}

const PHOTO_HOSTS = ['firebasestorage.googleapis.com', 's3.amazonaws.com'];

/** Only https URLs on Firebase Storage or S3 are passed to the model. */
function cleanPhotoUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2000) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== 'https:' || !PHOTO_HOSTS.includes(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function cleanComparables(v: unknown): Comparable[] {
  if (!Array.isArray(v)) return [];
  const out: Comparable[] = [];
  for (const raw of v.slice(0, 10)) {
    const c = obj(raw);
    const price = cleanNum(c.price, 1, 1_000_000);
    const make = cleanStr(c.make, 40);
    if (!price || !make) continue;
    out.push({make, model: cleanStr(c.model, 60), year: cleanStr(c.year, 4).replace(/[^0-9]/g, ''), price: Math.round(price)});
  }
  return out;
}

const nullable = (type: string) => ({anyOf: [{type}, {type: 'null'}]});

const SNAP_SCHEMA = {
  type: 'object',
  properties: {
    make: nullable('string'),
    model: nullable('string'),
    year: nullable('string'),
    color: nullable('string'),
    seatColor: nullable('string'),
    passengers: nullable('integer'),
    isElectric: nullable('boolean'),
    batteryType: nullable('string'),
    isLifted: nullable('boolean'),
    isStreetLegal: nullable('boolean'),
    hasSoundSystem: nullable('boolean'),
    hasExtendedTop: nullable('boolean'),
    isUsed: nullable('boolean'),
    category: {type: 'string', enum: [...CATEGORIES]},
    title: {type: 'string'},
    description: {type: 'string'},
    suggestedPrice: nullable('number'),
    priceReason: {type: 'string'},
  },
  required: [
    'make', 'model', 'year', 'color', 'seatColor', 'passengers', 'isElectric', 'batteryType', 'isLifted',
    'isStreetLegal', 'hasSoundSystem', 'hasExtendedTop', 'isUsed', 'category', 'title', 'description',
    'suggestedPrice', 'priceReason',
  ],
  additionalProperties: false,
};

const SNAP_SYSTEM = `You help golf cart dealership staff create a listing from phone photos and/or a short dictated note.

Return a JSON object describing the item.

Accuracy rules (most important):
- Only state what is clearly visible in the photos or explicitly said in the note. If something is not visible and not said, set it to null. Never guess a make, model, or year from general appearance alone; use a badge, decal, or the note. If unsure, use null.
- If the note and the photos disagree, trust the note.
- batteryType: only a value such as "Lithium" or "Lead acid" when said in the note or clearly shown (for example a battery label). Otherwise null.
- isElectric: true or false only when said or clearly visible (for example a gas cap or exhaust, or a charging port). Otherwise null.
- isUsed: true or false only when said in the note. Otherwise null.
- passengers: count of seating positions when clearly visible or said. Otherwise null.
- category: "golf cart" for passenger golf carts and LSVs, "utility" for utility vehicles or carts with a cargo bed as the main purpose, "accessory" for add-ons (covers, seat kits, lights, speakers), "part" for replacement parts, "other" otherwise.
- title: at most 60 characters; year, make, model and one standout visible fact when known. No emojis, no all-caps words.
- description: plain text, no markdown, no emojis, no hashtags, 40-120 words. Describe only the facts above and what is visible. Do not invent condition details, mileage, battery age, warranty, history, or accessories. Do not include any company name, phone number, URL, or price.

Pricing:
- suggestedPrice is a rough estimate for staff only. Base it only on the comparable in-stock carts provided (same make first, then similar year/model). Never invent or cite market data, averages from elsewhere, or outside sources.
- If no comparable carts are provided, or none is reasonably similar, set suggestedPrice to null.
- priceReason: one short sentence that starts with "Rough estimate:" and names which provided comparables it is based on; or explains why there is no estimate.`;

function snapPrompt(text: string, comparables: Comparable[], photoCount: number): string {
  const parts: string[] = [];
  parts.push(photoCount ? `${photoCount} photo(s) of the item are attached.` : 'No photos are attached.');
  parts.push(text ? `Staff note (dictated or typed):\n"""\n${text}\n"""` : 'No staff note was given.');
  parts.push(
    comparables.length
      ? `Comparable in-stock carts at our dealership (JSON; the only pricing data you may use):\n${JSON.stringify(comparables)}`
      : 'No comparable in-stock carts were provided, so suggestedPrice must be null.',
  );
  return parts.join('\n\n');
}

// Built via RegExp so the functions tsconfig (target es2017) accepts the `u`-flag property escape.
const EMOJI_RE = new RegExp('[\\p{Extended_Pictographic}\\u{FE0F}\\u{200D}]', 'gu');

function plain(s: string): string {
  return s
    .replace(EMOJI_RE, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/(^|\s)#[A-Za-z0-9_]+/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseJson(text: string): Json | null {
  try {
    return obj(JSON.parse(text));
  } catch {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      return obj(JSON.parse(text.slice(s, e + 1)));
    } catch {
      return null;
    }
  }
}

function finalizeSnap(o: Json, comparables: Comparable[]): AiSnapResult {
  const s = (v: unknown, max = 60) => cleanStr(v, max) || null;
  const year = s(o.year, 4)?.replace(/[^0-9]/g, '') || null;
  const passengers = cleanNum(o.passengers, 1, 12);
  let suggestedPrice = cleanNum(o.suggestedPrice, 1, 200_000);
  let priceReason = cleanStr(o.priceReason, 300);
  if (!comparables.length) {
    suggestedPrice = null;
    priceReason = 'No comparable carts in stock to base an estimate on.';
  } else if (suggestedPrice !== null) {
    suggestedPrice = Math.round(suggestedPrice / 10) * 10;
    if (!/^rough estimate/i.test(priceReason)) priceReason = `Rough estimate: ${priceReason || 'based on similar carts in stock.'}`;
  }
  const category = CATEGORIES.includes(o.category as Category) ? (o.category as Category) : 'golf cart';
  return {
    make: s(o.make, 40),
    model: s(o.model, 60),
    year: year && /^(19|20)\d{2}$/.test(year) ? year : null,
    color: s(o.color, 40),
    seatColor: s(o.seatColor, 40),
    passengers: passengers ? Math.round(passengers) : null,
    isElectric: cleanBool(o.isElectric),
    batteryType: s(o.batteryType, 40),
    isLifted: cleanBool(o.isLifted),
    isStreetLegal: cleanBool(o.isStreetLegal),
    hasSoundSystem: cleanBool(o.hasSoundSystem),
    hasExtendedTop: cleanBool(o.hasExtendedTop),
    isUsed: cleanBool(o.isUsed),
    category,
    title: plain(cleanStr(o.title, 80)).slice(0, 60),
    description: plain(typeof o.description === 'string' ? o.description : '').slice(0, 3000),
    suggestedPrice,
    priceReason,
  };
}

async function snapCall(client: Anthropic, photos: string[], text: string, comparables: Comparable[]) {
  const content: Anthropic.Beta.BetaContentBlockParam[] = photos.map((url) => ({type: 'image', source: {type: 'url', url}}));
  content.push({type: 'text', text: snapPrompt(text, comparables, photos.length)});
  return client.beta.messages.create({
    model: MODEL,
    max_tokens: 6000,
    // Visual identification benefits from a bit more thought than the text-only writer.
    output_config: {effort: 'medium', format: {type: 'json_schema', schema: SNAP_SCHEMA}},
    // Server-side refusal fallback (routes a declined request to a fallback model).
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SNAP_SYSTEM,
    messages: [{role: 'user', content}],
  });
}

/** Snap-to-list AI fill: {photoUrls?: string[] (≤3), text?: string, comparables?: [{make,model,year,price}] (≤10)}. */
export const mpAiSnap = onCall(
  {secrets: [ANTHROPIC_SECRET], timeoutSeconds: 120, memory: '256MiB'},
  async (req): Promise<AiSnapResult> => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const uid = req.auth.uid;
    if (!(await roleOf(uid))) throw new HttpsError('permission-denied', 'MP Assistant access required.');

    const data = obj(req.data);
    let photos = (Array.isArray(data.photoUrls) ? data.photoUrls : [])
      .map(cleanPhotoUrl)
      .filter((u): u is string => !!u)
      .slice(0, 3);
    const text = typeof data.text === 'string' ? data.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 4000) : '';
    const comparables = cleanComparables(data.comparables);
    if (!photos.length && !text) {
      throw new HttpsError('invalid-argument', 'Add a photo or describe the cart first.');
    }

    const apiKey = (process.env[ANTHROPIC_SECRET] || '');
    if (!apiKey) throw new HttpsError('failed-precondition', 'AI is not configured (missing ANTHROPIC_API_KEY).');
    const client = new Anthropic({apiKey, timeout: 90_000, maxRetries: 1});

    let result: AiSnapResult | null = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        const msg = await snapCall(client, photos, text, comparables);
        if (msg.stop_reason === 'refusal') {
          throw new HttpsError('aborted', 'The AI declined this request. Fill the form manually.');
        }
        if (msg.stop_reason === 'max_tokens') continue;
        const out = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
        const parsed = out ? parseJson(out) : null;
        if (parsed) result = finalizeSnap(parsed, comparables);
        else logger.warn('mpAiSnap: unparseable model output', {uid, attempt});
      } catch (e) {
        if (e instanceof HttpsError) throw e;
        if (e instanceof Anthropic.BadRequestError && photos.length) {
          // Most likely an image URL could not be fetched.
          logger.warn('mpAiSnap: bad request with photos', {uid, message: e.message});
          if (!text) throw new HttpsError('invalid-argument', "The AI couldn't open the photos. Try again or describe the cart instead.");
          photos = [];
          continue;
        }
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
          logger.error('mpAiSnap: Anthropic auth error', {status: e.status});
          throw new HttpsError('failed-precondition', 'AI is not configured (invalid ANTHROPIC_API_KEY).');
        }
        if (e instanceof Anthropic.RateLimitError) {
          throw new HttpsError('resource-exhausted', 'AI is busy. Try again in a minute.');
        }
        if (e instanceof Anthropic.APIError) {
          logger.error('mpAiSnap: Anthropic API error', {status: e.status, message: e.message});
          throw new HttpsError('unavailable', 'AI is temporarily unavailable. Try again.');
        }
        logger.error('mpAiSnap: unexpected error', e);
        throw new HttpsError('internal', 'AI fill failed. Try again.');
      }
    }
    if (!result) throw new HttpsError('internal', 'AI returned an unreadable response. Try again.');
    logger.info('mpAiSnap: ok', {uid, photos: photos.length, text: !!text, comparables: comparables.length});
    return result;
  },
);

// ===========================================================================
// Import connectors
// ===========================================================================

type IntegrationKind = 'woocommerce' | 'shopify' | 'json-feed' | 'csv-url';

interface IntegrationDoc {
  id: string;
  kind: IntegrationKind;
  name: string;
  baseUrl: string;
  enabled: boolean;
  locationId: string;
  mapping?: Record<string, string>;
}

/** One source item normalized to cart fields. */
interface ImportItem {
  sourceId: string;
  make: string;
  model: string;
  year: string;
  color: string;
  seatColor: string;
  passengers: string;
  price: number;
  locationId: string;
  isUsed: boolean;
  isElectric: boolean;
  batteryType: string;
  packVoltage: string;
  serial: string;
  photos: string[];
  description: string;
  category: string;
  inStock: boolean;
}

export interface ImportResult {
  ok: boolean;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  hidden: number;
  removed: number;
  skipped: number;
  warning?: string;
  error?: string;
  summary: string;
}

const MAX_ITEMS = 5000;
const REQUEST_TIMEOUT_MS = 30_000;
const RUN_BUDGET_MS = 420_000;

class ImportError extends Error {}

async function fetchWithTimeout(url: string, init: {headers?: Record<string, string>} = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {headers: init.headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'follow'});
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') throw new ImportError(`Timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${hostOf(url)}`);
    throw new ImportError(`Could not reach ${hostOf(url)} (${e instanceof Error ? e.message : String(e)})`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ImportError(`${hostOf(url)} rejected the credentials (HTTP ${res.status}). Check the API key/token and its read permission.`);
  }
  if (res.status === 404) throw new ImportError(`Not found (HTTP 404) at ${hostOf(url)}. Check the store URL.`);
  if (!res.ok) throw new ImportError(`${hostOf(url)} returned HTTP ${res.status}.`);
  return res;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 60);
  }
}

/** Validates a user-entered URL (https only; a bare host gets https:// added). */
function httpsUrl(raw: string, what: string): URL {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new ImportError(`${what} is not a valid URL.`);
  }
  if (u.protocol !== 'https:') throw new ImportError(`${what} must use https://.`);
  return u;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ImportError('The response was not valid JSON.');
  }
}

const stripHtml = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

const YEAR_RE = /\b(19[89]\d|20\d{2})\b/;

/** Splits "2024 Evolution D5 Maverick" into make/model/year when the source has no structured fields. */
function splitName(name: string, knownMake = ''): {make: string; model: string; year: string} {
  const year = name.match(YEAR_RE)?.[1] || '';
  let rest = name.replace(YEAR_RE, ' ').replace(/\s+/g, ' ').trim();
  let make = knownMake;
  if (make && rest.toLowerCase().startsWith(make.toLowerCase())) rest = rest.slice(make.length).trim();
  else if (!make) {
    const [first, ...others] = rest.split(' ');
    make = first || '';
    rest = others.join(' ');
  }
  return {make, model: rest.replace(/^[-–|:,\s]+/, ''), year};
}

function categoryOf(text: string): string {
  const t = text.toLowerCase();
  if (/\bparts?\b/.test(t)) return 'part';
  if (/accessor/.test(t)) return 'accessory';
  if (/utility|utv/.test(t)) return 'utility';
  return 'golf cart';
}

const isUsedText = (t: string) => /\b(used|pre-?owned|refurb)/i.test(t);
const isGasText = (t: string) => /\bgas\b|gasoline|\befi\b/i.test(t);
const locationFrom = (v: unknown, fallback: string) => {
  const s = str(v).toUpperCase();
  return /^T\d+(\.5)?$/.test(s) ? s : fallback;
};

// ---- WooCommerce ----------------------------------------------------------

async function fetchWoo(integ: IntegrationDoc, secret: Json, deadline: number): Promise<ImportItem[]> {
  const key = str(secret.consumerKey);
  const sec = str(secret.consumerSecret);
  if (!key || !sec) throw new ImportError('WooCommerce consumer key/secret are not saved for this connector.');
  const base = httpsUrl(integ.baseUrl, 'Store URL');
  const root = `${base.origin}${base.pathname.replace(/\/+$/, '')}`;
  const auth = 'Basic ' + Buffer.from(`${key}:${sec}`).toString('base64');
  const out: ImportItem[] = [];
  for (let page = 1; page <= 60 && out.length < MAX_ITEMS; page++) {
    if (Date.now() > deadline) throw new ImportError('Import took too long; try again or narrow the source.');
    const url = `${root}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`;
    const res = await fetchWithTimeout(url, {headers: {Authorization: auth, Accept: 'application/json'}});
    const list = await readJson(res);
    if (!Array.isArray(list)) throw new ImportError('WooCommerce did not return a product list. Is the REST API enabled?');
    for (const raw of list) out.push(mapWoo(obj(raw), integ.locationId));
    const totalPages = Number(res.headers.get('x-wp-totalpages')) || 0;
    if (list.length < 100 || (totalPages && page >= totalPages)) break;
  }
  return out;
}

function mapWoo(p: Json, defaultLoc: string): ImportItem {
  const attrs = (Array.isArray(p.attributes) ? p.attributes : []).map(obj);
  const attr = (re: RegExp) => {
    const a = attrs.find((x) => re.test(str(x.name)));
    if (!a) return '';
    return Array.isArray(a.options) ? str(a.options[0]) : str(a.option);
  };
  const cats = (Array.isArray(p.categories) ? p.categories : []).map((c) => str(obj(c).name)).join(' ');
  const name = stripHtml(str(p.name));
  const split = splitName(name, attr(/make|brand|manufacturer/i));
  const text = `${name} ${cats} ${attr(/condition/i)}`;
  return {
    sourceId: str(p.id),
    make: split.make,
    model: attr(/^model/i) || split.model,
    year: attr(/year/i) || split.year,
    color: attr(/^colou?r|body colou?r/i),
    seatColor: attr(/seat/i),
    passengers: attr(/passenger|seat(ing|s)\b/i),
    price: Number(p.price || p.regular_price) || 0,
    locationId: locationFrom(attr(/location|store/i), defaultLoc),
    isUsed: isUsedText(text),
    isElectric: !isGasText(`${text} ${attr(/fuel|power/i)}`),
    batteryType: attr(/battery/i),
    packVoltage: attr(/volt/i),
    serial: str(p.sku),
    photos: (Array.isArray(p.images) ? p.images : []).map((i) => str(obj(i).src)).filter((u) => /^https:\/\//i.test(u)),
    description: stripHtml(str(p.short_description) || str(p.description)),
    category: categoryOf(`${cats} ${name}`),
    inStock: str(p.stock_status) !== 'outofstock',
  };
}

// ---- Shopify --------------------------------------------------------------

function shopifyHost(baseUrl: string): string {
  const raw = baseUrl.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  const host = raw.includes('.') ? raw : `${raw}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host)) {
    throw new ImportError('Shopify store must be your-store.myshopify.com (the admin domain, not a custom domain).');
  }
  return host;
}

function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (m) return m[1];
  }
  return null;
}

async function fetchShopify(integ: IntegrationDoc, secret: Json, deadline: number): Promise<ImportItem[]> {
  const token = str(secret.accessToken);
  if (!token) throw new ImportError('Shopify access token is not saved for this connector.');
  const host = shopifyHost(integ.baseUrl);
  const out: ImportItem[] = [];
  let url: string | null = `https://${host}/admin/api/2024-10/products.json?limit=250&status=active`;
  for (let page = 0; url && page < 40 && out.length < MAX_ITEMS; page++) {
    if (Date.now() > deadline) throw new ImportError('Import took too long; try again or narrow the source.');
    // Only follow pagination links on the same store.
    if (hostOf(url) !== host) break;
    const res = await fetchWithTimeout(url, {headers: {'X-Shopify-Access-Token': token, 'Accept': 'application/json'}});
    const body = obj(await readJson(res));
    const list = Array.isArray(body.products) ? body.products : null;
    if (!list) throw new ImportError('Shopify did not return a product list. Does the token have read_products?');
    for (const raw of list) out.push(mapShopify(obj(raw), integ.locationId));
    url = nextLink(res.headers.get('link'));
  }
  return out;
}

function mapShopify(p: Json, defaultLoc: string): ImportItem {
  const variants = (Array.isArray(p.variants) ? p.variants : []).map(obj);
  const v0 = variants[0] || {};
  const title = str(p.title);
  const vendor = str(p.vendor);
  const split = splitName(title, vendor);
  const tags = Array.isArray(p.tags) ? p.tags.map(str).join(' ') : str(p.tags);
  const text = `${title} ${tags} ${str(p.product_type)}`;
  const tracked = variants.filter((v) => str(v.inventory_management));
  const inStock =
    !tracked.length ||
    variants.some((v) => !str(v.inventory_management) || Number(v.inventory_quantity) > 0 || str(v.inventory_policy) === 'continue');
  const tagLoc = tags.match(/\bT\d+(\.5)?\b/i)?.[0] || '';
  return {
    sourceId: str(p.id),
    make: split.make,
    model: split.model,
    year: split.year,
    color: '',
    seatColor: '',
    passengers: '',
    price: Number(v0.price) || 0,
    locationId: locationFrom(tagLoc, defaultLoc),
    isUsed: isUsedText(text),
    isElectric: !isGasText(text),
    batteryType: '',
    packVoltage: '',
    serial: str(v0.sku),
    photos: (Array.isArray(p.images) ? p.images : []).map((i) => str(obj(i).src)).filter((u) => /^https:\/\//i.test(u)),
    description: stripHtml(str(p.body_html)),
    category: categoryOf(`${str(p.product_type)} ${title}`),
    inStock,
  };
}

// ---- JSON feed / CSV URL --------------------------------------------------

/** Cart fields a feed/CSV mapping can target. */
const FEED_FIELDS = [
  'id', 'make', 'model', 'year', 'title', 'color', 'seatColor', 'passengers', 'price', 'location', 'condition',
  'serial', 'photos', 'description', 'category', 'inStock', 'fuel', 'batteryType', 'voltage',
] as const;
type FeedField = (typeof FEED_FIELDS)[number];

const GUESS: Record<FeedField, RegExp> = {
  id: /^(id|_id|sku|stock ?(no|number|#)?|product ?id)$/i,
  make: /^(make|brand|manufacturer|vendor)$/i,
  model: /^model$/i,
  year: /^(year|model ?year)$/i,
  title: /^(title|name|product ?name)$/i,
  color: /^(colou?r|body ?colou?r|cart ?colou?r)$/i,
  seatColor: /^seat ?colou?r$/i,
  passengers: /^(passengers?|seats?|seating)$/i,
  price: /^(price|retail ?price|sale ?price|msrp|amount)$/i,
  location: /^(location|store|location ?id|branch)$/i,
  condition: /^(condition|new ?\/ ?used|used|is ?used)$/i,
  serial: /^(serial|serial ?(no|number)|vin)$/i,
  photos: /^(photos?|images?|image ?urls?|pictures?|photo ?urls?)$/i,
  description: /^(description|details|notes|body)$/i,
  category: /^(category|type|product ?type)$/i,
  inStock: /^(in ?stock|available|stock ?status|status)$/i,
  fuel: /^(fuel|power|fuel ?type|electric|gas)$/i,
  batteryType: /^battery( ?type)?$/i,
  voltage: /^(voltage|pack ?voltage|volts)$/i,
};

/** Reads a dotted path ("specs.color") from an object. */
function getPath(o: Json, path: string): unknown {
  if (path in o) return o[path];
  let cur: unknown = o;
  for (const k of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[k];
  }
  return cur;
}

/** mapping is sourceField → cart field; missing fields are guessed from the source's keys. */
function resolveMapping(keys: string[], mapping: Record<string, string> | undefined): Partial<Record<FeedField, string>> {
  const out: Partial<Record<FeedField, string>> = {};
  for (const [src, target] of Object.entries(mapping || {})) {
    if ((FEED_FIELDS as readonly string[]).includes(target) && src) out[target as FeedField] = src;
  }
  for (const f of FEED_FIELDS) {
    if (out[f]) continue;
    const k = keys.find((key) => GUESS[f].test(key.trim()));
    if (k) out[f] = k;
  }
  return out;
}

function splitUrls(v: unknown): string[] {
  const list = Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? str(obj(x).src || obj(x).url) : str(x))) : str(v).split(/[\s,|;]+/);
  return list.map((s) => s.trim()).filter((s) => /^https:\/\//i.test(s));
}

function boolish(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  const s = str(v).toLowerCase();
  if (!s) return null;
  if (/^(y|yes|true|1|in ?stock|instock|available|active)$/.test(s)) return true;
  if (/^(n|no|false|0|out ?of ?stock|outofstock|sold|unavailable|inactive)$/.test(s)) return false;
  return null;
}

function mapFeedRecord(rec: Json, m: Partial<Record<FeedField, string>>, defaultLoc: string): ImportItem {
  const g = (f: FeedField) => (m[f] ? getPath(rec, m[f] as string) : undefined);
  const title = str(g('title'));
  const split = splitName(title, str(g('make')));
  const cond = str(g('condition'));
  const condBool = boolish(cond);
  const isUsed = cond ? (/^(is ?used)$/i.test(m.condition || '') && condBool !== null ? condBool : isUsedText(cond)) : isUsedText(title);
  const fuel = str(g('fuel'));
  const stock = boolish(g('inStock'));
  return {
    sourceId: str(g('id')) || str(g('serial')) || '',
    make: str(g('make')) || split.make,
    model: str(g('model')) || split.model,
    year: str(g('year')).replace(/[^0-9]/g, '').slice(0, 4) || split.year,
    color: str(g('color')),
    seatColor: str(g('seatColor')),
    passengers: str(g('passengers')),
    price: cleanNum(g('price'), 0, 10_000_000) || 0,
    locationId: locationFrom(g('location'), defaultLoc),
    isUsed,
    isElectric: fuel ? !isGasText(fuel) && !/^(no|false|0)$/i.test(fuel) : !isGasText(title),
    batteryType: str(g('batteryType')),
    packVoltage: str(g('voltage')),
    serial: str(g('serial')),
    photos: splitUrls(g('photos')),
    description: stripHtml(str(g('description'))),
    category: categoryOf(`${str(g('category'))} ${title}`),
    inStock: stock === null ? true : stock,
  };
}

/** Finds the largest array of objects inside a JSON response. */
function findRecords(v: unknown, depth = 0): Json[] {
  if (depth > 5 || !v || typeof v !== 'object') return [];
  if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) return v as Json[];
  let best: Json[] = [];
  for (const child of Array.isArray(v) ? v : Object.values(v as Json)) {
    const found = findRecords(child, depth + 1);
    if (found.length > best.length) best = found;
  }
  return best;
}

function feedHeaders(secret: Json): Record<string, string> {
  const name = str(secret.headerName);
  const value = str(secret.headerValue);
  return name && value && /^[A-Za-z0-9-]+$/.test(name) ? {[name]: value} : {};
}

async function fetchJsonFeed(integ: IntegrationDoc, secret: Json): Promise<ImportItem[]> {
  const url = httpsUrl(integ.baseUrl, 'Feed URL');
  const res = await fetchWithTimeout(url.toString(), {headers: {Accept: 'application/json', ...feedHeaders(secret)}});
  const records = findRecords(await readJson(res)).slice(0, MAX_ITEMS);
  if (!records.length) throw new ImportError('No list of items was found in the JSON feed.');
  const keys = [...new Set(records.slice(0, 20).flatMap((r) => Object.keys(r)))];
  const m = resolveMapping(keys, integ.mapping);
  return records.map((r) => mapFeedRecord(r, m, integ.locationId));
}

/** Small RFC 4180 CSV parser (quotes, escaped quotes, CRLF, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

async function fetchCsvUrl(integ: IntegrationDoc, secret: Json): Promise<ImportItem[]> {
  const url = httpsUrl(integ.baseUrl, 'CSV URL');
  const res = await fetchWithTimeout(url.toString(), {headers: {Accept: 'text/csv,text/plain,*/*', ...feedHeaders(secret)}});
  const text = await res.text();
  if (text.length > 20 * 1024 * 1024) throw new ImportError('CSV file is larger than 20 MB.');
  const rows = parseCsv(text);
  if (rows.length < 2) throw new ImportError('The CSV has no data rows.');
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1, MAX_ITEMS + 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])) as Json);
  const m = resolveMapping(header, integ.mapping);
  return records.map((r) => mapFeedRecord(r, m, integ.locationId));
}

// ---- Upsert ---------------------------------------------------------------

const safeId = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

/** DMS-shaped payload so the app's mapDmsCartObject reads imported items like DMS carts. */
function buildPayload(item: ImportItem, docId: string): Json {
  return {
    _id: docId,
    cartType: {make: item.make, model: item.model, year: item.year},
    cartAttributes: {
      cartColor: item.color,
      seatColor: item.seatColor,
      passengers: item.passengers,
    },
    battery: {type: item.batteryType, packVoltage: item.packVoltage},
    cartLocation: {locationId: item.locationId},
    retailPrice: item.price,
    isUsed: item.isUsed,
    isElectric: item.isElectric,
    serialNo: item.serial,
    title: {isStreetLegal: false},
    imageUrls: item.photos.slice(0, 20),
    isInStock: item.inStock,
    _mpDescription: item.description.slice(0, 5000),
    _mpCategory: item.category,
  };
}

async function loadIntegration(id: string): Promise<IntegrationDoc> {
  const snap = await admin.firestore().collection(INTEGRATIONS).doc(id).get();
  if (!snap.exists) throw new ImportError('Connector not found.');
  const d = snap.data() || {};
  const kind = str(d.kind) as IntegrationKind;
  if (!['woocommerce', 'shopify', 'json-feed', 'csv-url'].includes(kind)) throw new ImportError(`Unknown connector type "${kind}".`);
  return {
    id,
    kind,
    name: str(d.name) || id,
    baseUrl: str(d.baseUrl),
    enabled: d.enabled !== false,
    locationId: str(d.locationId) || 'Other',
    mapping: d.mapping && typeof d.mapping === 'object' ? (d.mapping as Record<string, string>) : undefined,
  };
}

function summarize(r: Omit<ImportResult, 'summary'>): string {
  if (!r.ok) return `Failed: ${r.error}`;
  const s =
    `Fetched ${r.fetched}: ${r.created} new, ${r.updated} updated, ${r.unchanged} unchanged, ` +
    `${r.hidden} out of stock, ${r.removed} removed, ${r.skipped} skipped`;
  return r.warning ? `${s}. ${r.warning}` : s;
}

/** Runs one connector end to end and records lastRunAt/lastResult + an audit entry. Never throws. */
export async function runImport(integrationId: string, trigger: string, deadline = Date.now() + RUN_BUDGET_MS): Promise<ImportResult> {
  const db = admin.firestore();
  const started = Date.now();
  const base = {ok: false, fetched: 0, created: 0, updated: 0, unchanged: 0, hidden: 0, removed: 0, skipped: 0};
  let result: ImportResult;
  let integ: IntegrationDoc | null = null;
  try {
    integ = await loadIntegration(integrationId);
    if (!integ.baseUrl) throw new ImportError('Set the store / feed URL first.');
    const secretSnap = await db.collection(SECRETS).doc(integrationId).get();
    const secret = secretSnap.exists ? secretSnap.data() || {} : {};

    let items: ImportItem[];
    if (integ.kind === 'woocommerce') items = await fetchWoo(integ, secret, deadline);
    else if (integ.kind === 'shopify') items = await fetchShopify(integ, secret, deadline);
    else if (integ.kind === 'json-feed') items = await fetchJsonFeed(integ, secret);
    else items = await fetchCsvUrl(integ, secret);
    items = items.slice(0, MAX_ITEMS);

    const source = `import:${integ.id}`;
    const existing = await db.collection(CARTS).where('source', '==', source).get();
    const byId = new Map(existing.docs.map((d) => [d.id, d]));

    let writer = db.batch();
    let ops = 0;
    const flush = async () => {
      if (ops) await writer.commit();
      writer = db.batch();
      ops = 0;
    };

    const seen = new Set<string>();
    const counts = {...base, fetched: items.length};
    for (const item of items) {
      if (!(item.make || item.model) || !(item.price > 0)) {
        counts.skipped++;
        continue;
      }
      const sid =
        safeId(item.sourceId) ||
        createHash('sha1').update(`${item.make}|${item.model}|${item.year}|${item.serial}|${item.photos[0] || ''}`).digest('hex').slice(0, 16);
      const docId = `imp_${safeId(integ.id)}_${sid}`;
      if (seen.has(docId)) {
        counts.skipped++;
        continue;
      }
      seen.add(docId);
      const payload = JSON.stringify(buildPayload(item, docId));
      const payloadHash = createHash('sha1').update(payload).digest('hex');
      const prev = byId.get(docId);
      if (!item.inStock) counts.hidden++;
      if (prev?.get('payloadHash') === payloadHash) {
        counts.unchanged++;
        continue;
      }
      const data: Json = {
        payload,
        payloadHash,
        savedAt: started,
        dmsId: '',
        serial: item.serial,
        locationId: item.locationId,
        isUsed: item.isUsed,
        source,
        createdBy: 'import',
        photoUrls: item.photos.slice(0, 20),
      };
      if (!prev) {
        Object.assign(data, {createdAt: started, postedBy: {}, postedAccounts: {}});
        counts.created++;
      } else counts.updated++;
      writer.set(db.collection(CARTS).doc(docId), data, {merge: true});
      if (++ops >= 400) await flush();
    }
    await flush();

    // Remove items that disappeared from the source (only this connector's docs).
    const stale = existing.docs.filter((d) => !seen.has(d.id));
    let warning: string | undefined;
    if (stale.length && (seen.size === 0 || (existing.size > 20 && stale.length > existing.size * 0.5))) {
      warning = `Kept ${stale.length} missing items: the source returned ${seen.size} usable items, which looks incomplete.`;
    } else {
      for (const d of stale) {
        writer.delete(d.ref);
        counts.removed++;
        if (++ops >= 400) await flush();
      }
      await flush();
    }
    result = {...counts, ok: true, ...(warning ? {warning} : {}), summary: ''};
  } catch (e) {
    const message = e instanceof ImportError ? e.message : e instanceof Error ? `Unexpected error: ${e.message}` : String(e);
    if (!(e instanceof ImportError)) logger.error('mpImport: unexpected error', {integrationId, e});
    result = {...base, error: message, summary: ''};
  }
  result.summary = summarize(result);

  try {
    await db.collection(INTEGRATIONS).doc(integrationId).set({lastRunAt: Date.now(), lastResult: result.summary}, {merge: true});
  } catch (e) {
    logger.warn('mpImport: could not write lastResult', {integrationId, e});
  }
  try {
    await db.collection(AUDIT).add({
      actorUid: 'system',
      actorName: 'Import',
      action: 'import.run',
      target: integ ? `${integ.name} (${integ.kind})` : integrationId,
      details: `${trigger}: ${result.summary}`.slice(0, 1000),
      ts: Date.now(),
    });
  } catch (e) {
    logger.warn('mpImport: audit write failed', e);
  }
  logger.info('mpImport done', {integrationId, trigger, ...result});
  return result;
}

/** "Run now" from the Import page (managers/admins): {integrationId}. */
export const mpRunImport = onCall({timeoutSeconds: 540, memory: '512MiB'}, async (req): Promise<ImportResult> => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const role = await roleOf(req.auth.uid);
  if (role !== 'admin' && role !== 'manager') throw new HttpsError('permission-denied', 'Manager or admin role required.');
  const id = cleanStr(obj(req.data).integrationId, 200);
  if (!id || id.includes('/')) throw new HttpsError('invalid-argument', 'integrationId is required.');
  return runImport(id, `manual:${req.auth.uid}`);
});

/** Every 6 hours: runs all enabled connectors, one after another. */
export const mpImportScheduled = onSchedule(
  {schedule: 'every 6 hours', timeZone: 'America/New_York', timeoutSeconds: 540, memory: '512MiB'},
  async () => {
    const started = Date.now();
    const snap = await admin.firestore().collection(INTEGRATIONS).where('enabled', '==', true).get();
    for (const d of snap.docs) {
      // Leave headroom under the 540s limit; anything skipped runs on the next schedule.
      const remaining = started + 480_000 - Date.now();
      if (remaining < 60_000) {
        logger.warn('mpImportScheduled: out of time, skipping', {integrationId: d.id});
        continue;
      }
      await runImport(d.id, 'schedule', Date.now() + Math.min(RUN_BUDGET_MS, remaining - 30_000));
    }
  },
);
