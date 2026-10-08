// Tigon MP Assistant — inventory sync from the DMS website API (production only).
// Runs alongside the IoT functions in the same project; data lives in mp_* collections.
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {createHash} from 'crypto';
import {handleCartSold, nextPriceHistory, priceDropOf, stockedAtOf} from './sales/inventory';
import {loadSalesSettings} from './sales/settings';
import {cartSummary} from './sales/util';

const DMS_API_BASE = 'https://api.tigondms.com/wp-website';
const DEFAULT_IMAGE_BASE = 'https://s3.amazonaws.com/prod.docs.s3/default-cart-web-images/';
const PAGE_SIZE = 100;
const MAX_PAGES = 200;

const CARTS = 'mp_carts';
const USERS = 'mp_users';
const SYNC_STATUS = 'mp_meta/sync';

// Location slugs used in default cart image file names.
const IMAGE_LOCATION_SLUGS: Record<string, string> = {
  T1: 'hatfield-pennsylvania',
  T2: 'ocean-view-new-jersey',
  T3: 'long-pond-pennsylvania',
  T4: 'dover-delaware',
  T5: 'scranton-pennsylvania',
  T6: 'raleigh-north-carolina',
  T7: 'south-bend-indiana',
  T8: 'gloucester-point-virginia',
  T9: 'bayville-new-jersey',
  T10: 'waretown-new-jersey',
  T11: 'orangeburg-south-carolina',
  T12: 'lecanto-florida',
  T13: 'swanton-ohio',
  T14: 'rio-grande-new-jersey',
};

type Json = Record<string, any>;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const slug = (v: unknown) => str(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function isCart(v: unknown): v is Json {
  return !!v && typeof v === 'object' && !Array.isArray(v) &&
    ('cartType' in (v as Json) || 'cartAttributes' in (v as Json));
}

const cartId = (c: Json) => str(c._id) || str(c.serialNo);
const locationOf = (c: Json) => str(c.cartLocation?.locationId) || str(c.cartLocation?.latestStoreId) || 'Other';

function isUsed(c: Json): boolean {
  if (typeof c.isUsed === 'boolean') return c.isUsed;
  if (typeof c.isNew === 'boolean') return !c.isNew;
  const cond = str(c.condition || c.cartCondition);
  return cond ? !/^new/i.test(cond) : true;
}

/** The response shape isn't fixed; take the largest array of cart objects found. */
function extractCarts(json: unknown, depth = 0): Json[] {
  if (depth > 4 || !json || typeof json !== 'object') return [];
  if (Array.isArray(json)) {
    if (json.some(isCart)) return json.filter(isCart);
    return json.flatMap((x) => extractCarts(x, depth + 1));
  }
  let best: Json[] = [];
  for (const v of Object.values(json as Json)) {
    const found = extractCarts(v, depth + 1);
    if (found.length > best.length) best = found;
  }
  return best;
}

async function fetchAllCarts(): Promise<Json[]> {
  const byId = new Map<string, Json>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${DMS_API_BASE}/get-carts`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({pageNumber: page, pageSize: PAGE_SIZE, isAllCarts: true}),
    });
    if (!res.ok) throw new Error(`DMS get-carts page ${page} failed: HTTP ${res.status}`);
    const carts = extractCarts(await res.json());
    const before = byId.size;
    for (const c of carts) if (cartId(c)) byId.set(cartId(c), c);
    // Stop on an empty page, or when the API ignores pagination and repeats itself.
    // (Not on a short page: the API may cap pageSize below what we ask for.)
    if (carts.length === 0 || byId.size === before) break;
  }
  return [...byId.values()];
}

/** New carts without photos get default web images: location set first, national fallback. */
async function resolveDefaultImages(c: Json, cache: Map<string, boolean>): Promise<string[]> {
  const stem = [slug(c.cartAttributes?.cartColor), slug(c.cartType?.make), slug(c.cartType?.model)]
    .filter(Boolean).join('-');
  if (!stem) return [];
  const exists = async (file: string) => {
    if (!cache.has(file)) {
      try {
        const r = await fetch(DEFAULT_IMAGE_BASE + file, {method: 'HEAD'});
        cache.set(file, r.ok);
      } catch {
        cache.set(file, false);
      }
    }
    return cache.get(file)!;
  };
  const locSlug = IMAGE_LOCATION_SLUGS[locationOf(c)];
  for (const where of [locSlug, 'national'].filter(Boolean)) {
    const files = [1, 2, 3, 4].map((i) => `${stem}-in-${where}-${i}.jpg`);
    if (!(await exists(files[0]))) continue;
    const ok = await Promise.all(files.map(exists));
    return files.filter((_, i) => ok[i]).map((f) => DEFAULT_IMAGE_BASE + f);
  }
  return [];
}

const hasPhotos = (c: Json) =>
  [c.imageUrls, c.internalCartImageUrls].some((a) => Array.isArray(a) && a.some((x) => str(x)));

export interface SyncResult {
  fetched: number;
  inStock: number;
  written: number;
  unchanged: number;
  removedSold: number;
  skippedDelete: number;
  warning?: string;
}

export async function syncInventory(trigger: string): Promise<SyncResult> {
  const db = admin.firestore();
  const started = Date.now();
  const statusRef = db.doc(SYNC_STATUS);
  try {
    const all = await fetchAllCarts();
    const inStock: Json[] = [];
    let skippedDelete = 0;
    for (const c of all) {
      if (c.isInStock === false || str(c.status).toLowerCase() === 'sold') continue;
      if (/delete/i.test(JSON.stringify(c))) {
        skippedDelete++;
        continue;
      }
      inStock.push(c);
    }

    const existing = await db.collection(CARTS)
      .select('payloadHash', 'serial', 'dmsId', 'source', 'price', 'priceHistory', 'firstSeenAt', 'stockedAt').get();
    const sales = await loadSalesSettings(true);
    const existingById = new Map(existing.docs.map((d) => [d.id, d]));

    const imageCache = new Map<string, boolean>();
    let writer = db.batch();
    let ops = 0;
    const flush = async () => {
      if (ops) await writer.commit();
      writer = db.batch();
      ops = 0;
    };

    let written = 0;
    let unchanged = 0;
    for (const c of inStock) {
      const id = cartId(c);
      const doc = {...c};
      if (!isUsed(c) && !hasPhotos(c)) {
        const defaults = await resolveDefaultImages(c, imageCache);
        if (defaults.length) doc._mpDefaultImages = defaults;
      }
      const payload = JSON.stringify(doc);
      const payloadHash = createHash('sha1').update(payload).digest('hex');
      const prev = existingById.get(id);
      // Days on lot: when the app first saw the cart (existing docs: when the doc was created).
      const firstSeenAt = Number(prev?.get('firstSeenAt')) || prev?.createTime?.toMillis() || started;
      if (prev?.get('payloadHash') === payloadHash) {
        unchanged++;
        if (!prev.get('firstSeenAt') || !prev.get('stockedAt')) {
          writer.set(prev.ref, {firstSeenAt, stockedAt: stockedAtOf(c, firstSeenAt, started).at}, {merge: true});
          if (++ops >= 450) await flush();
        }
        continue;
      }
      const price = Number(c.retailPrice) || 0;
      const priceFields: Json = {price};
      const history = nextPriceHistory(prev?.get('priceHistory'), price, started);
      if (history) priceFields.priceHistory = history;
      // Price drops (ideas 11): only when we knew the old price (first sync after this release just records it).
      const drop = prev && prev.get('price') !== undefined ? priceDropOf(prev.get('price'), price, sales.priceDrop.minDropPct) : null;
      if (drop) {
        priceFields.lastPriceDropAt = started;
        writer.create(db.collection('mp_price_changes').doc(`${id.replace(/[^A-Za-z0-9_-]/g, '_')}_${started}`), {
          cartId: id, cartTitle: cartSummary({payload}).title, oldPrice: drop.oldPrice, newPrice: drop.newPrice, dropPct: drop.pct,
          at: started, locationId: locationOf(c), leadsTexted: 0, accountsToEdit: [],
        });
        ops++;
      }
      const stocked = stockedAtOf(c, firstSeenAt, started);
      writer.set(db.collection(CARTS).doc(id), {
        payload,
        payloadHash,
        savedAt: started,
        dmsId: id,
        serial: str(c.serialNo),
        locationId: locationOf(c),
        isUsed: isUsed(c),
        source: 'dms-api',
        firstSeenAt,
        stockedAt: stocked.at,
        stockedAtSource: stocked.source,
        ...priceFields,
      }, {merge: true});
      written++;
      if (++ops >= 450) await flush();
    }
    await flush();

    // Anything no longer in stock in DMS is sold → remove. Guard against a bad/partial API response.
    const ids = new Set(inStock.map(cartId));
    const serials = new Set(inStock.map((c) => str(c.serialNo)).filter(Boolean));
    const stale = existing.docs.filter((d) => {
      // Listings created in the app or imported from other systems are never removed by the DMS sync.
      const source = str(d.get('source'));
      if (source === 'manual' || source.startsWith('import:')) return false;
      const serial = str(d.get('serial'));
      return !ids.has(d.id) && !ids.has(str(d.get('dmsId'))) && !(serial && serials.has(serial));
    });
    let removedSold = 0;
    let warning: string | undefined;
    const dmsCount = existing.docs.filter((d) => !/^(manual|import:)/.test(str(d.get('source')))).length;
    if (inStock.length === 0 || (dmsCount > 20 && stale.length > dmsCount * 0.5)) {
      warning = `Skipped removing ${stale.length} carts: DMS returned ${inStock.length} in-stock carts, which looks incomplete.`;
    } else {
      // Sold-cart clean-up (idea 13): tell posters and text interested leads before the cart is gone.
      for (let i = 0; i < stale.length; i += 100) {
        const full = await db.getAll(...stale.slice(i, i + 100).map((d) => d.ref));
        for (const snap of full) {
          // Carts marked sold in the app were already handled by mpCartSold.
          if (!snap.exists || snap.get('soldLocally') === true) continue;
          try {
            await handleCartSold(snap.id, snap.data() || {}, sales, 'dms');
          } catch (e) {
            logger.warn('mpSync: sold clean-up failed', snap.id, e);
          }
        }
      }
      for (const d of stale) {
        writer.delete(d.ref);
        removedSold++;
        if (++ops >= 450) await flush();
      }
      await flush();
    }

    const result: SyncResult = {
      fetched: all.length, inStock: inStock.length, written, unchanged, removedSold, skippedDelete,
      ...(warning ? {warning} : {}),
    };
    await statusRef.set({
      ok: true, trigger, startedAt: started, finishedAt: Date.now(), ...result, error: admin.firestore.FieldValue.delete(),
    }, {merge: true});
    logger.info('mpSync done', {trigger, ...result});
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('mpSync failed', err);
    await statusRef.set({ok: false, trigger, startedAt: started, finishedAt: Date.now(), error: message}, {merge: true});
    throw err;
  }
}

/** Hourly pull of active inventory from the DMS API. */
export const mpSyncInventory = onSchedule(
  {schedule: 'every 60 minutes', timeZone: 'America/New_York', timeoutSeconds: 540, memory: '512MiB'},
  async () => {
    await syncInventory('schedule');
  },
);

/** "Sync now" from the MP Assistant (admins only). */
export const mpSyncNow = onCall({timeoutSeconds: 540, memory: '512MiB'}, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const profile = await admin.firestore().collection(USERS).doc(req.auth.uid).get();
  if (!profile.exists || profile.get('role') !== 'admin') {
    throw new HttpsError('permission-denied', 'MP Assistant admin role required');
  }
  try {
    return await syncInventory(`manual:${req.auth.uid}`);
  } catch (err) {
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Sync failed');
  }
});
