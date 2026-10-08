// Track 4 — Inventory (ideas 11, 12, 13, 14, 15): price-drop alerts, aged inventory, sold-cart cleanup + similar carts,
// repost queue, walk-around videos. DMS sync hooks live in ../mpAssistant.ts (this track edits it).
//   mpPriceChanged : mp_price_changes created → text interested leads, call tasks, "update the price" to posters
//   mpCartSold     : mp_carts soldLocally false → true → "mark it sold" to posters, similar-carts text to leads
//   mpSimilarApi   : GET /api/similar/<cartId> → the sold cart + up to 6 similar in-stock carts (public)
import * as logger from 'firebase-functions/logger';
import {onDocumentCreated, onDocumentUpdated} from 'firebase-functions/v2/firestore';
import {onRequest} from 'firebase-functions/v2/https';
import {allPublicCarts, STORE_BY_ID} from '../mpShare';
import type {PublicCart} from '../mpShare';
import {loadSalesSettings} from './settings';
import type {SalesSettings} from './settings';
import {
  C, DAY_MS, PUBLIC_ORIGIN, cartSummary, db, e164, fill, leadTemplateData, loadPeople, managersFor, notify, nyDateKey, nyParts,
  storeCity,
} from './util';
import type {Json, Person} from './util';
import {queueSms} from './outbox';

/** Snapshot of carts the DMS sync removed (they sold), so the "similar carts" page still knows what sold. */
export const SOLD_CARTS = 'mp_sold_carts';
const REGION = 'us-central1';
const OPEN = new Set(['new', 'talking']);

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

export interface PricePoint {price: number; at: number}

/** A price drop of at least `minDropPct` percent → the drop, else null. Unknown/zero prices never count. */
export function priceDropOf(oldPrice: unknown, newPrice: unknown, minDropPct: number): {oldPrice: number; newPrice: number; pct: number} | null {
  const o = Number(oldPrice) || 0;
  const n = Number(newPrice) || 0;
  if (o <= 0 || n <= 0 || n >= o) return null;
  const pct = ((o - n) / o) * 100;
  if (pct + 1e-9 < Math.max(0, Number(minDropPct) || 0)) return null;
  return {oldPrice: o, newPrice: n, pct: Math.round(pct * 10) / 10};
}

/** Adds a price to the history when it changed (or the history is empty); keeps the last `max`. */
export function nextPriceHistory(history: unknown, price: number, at: number, max = 10): PricePoint[] | null {
  const list: PricePoint[] = (Array.isArray(history) ? history : [])
    .map((h: Json) => ({price: Number(h?.price) || 0, at: Number(h?.at) || 0}))
    .filter((h) => h.price > 0);
  if (!(price > 0)) return null;
  if (list.length && list[list.length - 1].price === price) return null;
  return [...list, {price, at}].slice(-max);
}

/** Payload fields that may hold the date a cart arrived (DMS field names vary). */
const STOCK_DATE_FIELDS = [
  'dateReceived', 'receivedDate', 'receivedAt', 'dateInStock', 'inStockDate', 'stockDate', 'stockedDate', 'stockedAt',
  'arrivalDate', 'dateArrived', 'dateAdded', 'addedDate', 'createdAt', 'createdDate', 'dateCreated', 'created_at', 'created',
];

function toMs(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v > 1e12 ? v : v > 1e9 ? v * 1000 : 0;
  if (typeof v === 'string') {
    if (/^\d{10,13}$/.test(v)) return toMs(Number(v));
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof v === 'object') {
    const o = v as Json;
    if (o.$date !== undefined) return toMs(o.$date);
    if (typeof o._seconds === 'number') return o._seconds * 1000;
    if (typeof o.seconds === 'number') return o.seconds * 1000;
  }
  return 0;
}

const plausible = (t: number, now: number) => t > Date.UTC(2015, 0, 1) && t <= now + DAY_MS;

/**
 * When the cart came into stock: a date field in the DMS payload, else the creation time inside a MongoDB-style
 * `_id` (first 8 hex digits = seconds), else when the app first saw it.
 */
export function stockedAtOf(payload: Json, firstSeenAt: number, now = Date.now()): {at: number; source: 'dms' | 'dms_id' | 'first_seen'} {
  for (const src of [payload, payload?.cart, payload?.cartLocation].filter((x) => x && typeof x === 'object')) {
    for (const f of STOCK_DATE_FIELDS) {
      const t = toMs((src as Json)[f]);
      if (plausible(t, now)) return {at: t, source: 'dms'};
    }
  }
  const id = String(payload?._id || '');
  if (/^[0-9a-f]{24}$/i.test(id)) {
    const t = parseInt(id.slice(0, 8), 16) * 1000;
    if (plausible(t, now)) return {at: t, source: 'dms_id'};
  }
  return {at: firstSeenAt || now, source: 'first_seen'};
}

export const daysOnLot = (stockedAt: number, now = Date.now()) =>
  stockedAt > 0 ? Math.max(0, Math.floor((now - stockedAt) / DAY_MS)) : 0;

export type AgedLevel = 'urgent' | 'aged' | null;
export function agedLevel(days: number, a: SalesSettings['aged']): AgedLevel {
  if (a.urgentDays > 0 && days >= a.urgentDays) return 'urgent';
  if (a.flagDays > 0 && days >= a.flagDays) return 'aged';
  return null;
}

/** Price after the suggested cut, rounded to the nearest $50. */
export const suggestedPrice = (price: number, cutPct: number) =>
  price > 0 ? Math.max(50, Math.round((price * (1 - (Number(cutPct) || 0) / 100)) / 50) * 50) : 0;

/** What sold (enough to find similar carts). */
export interface SoldCartInfo {
  id: string;
  title: string;
  make: string;
  model: string;
  price: number;
  isUsed: boolean;
  locationId: string;
}

const lc = (s: string) => s.trim().toLowerCase();
const stateOf = (locationId: string) => (STORE_BY_ID[locationId]?.cityState || '').split(',')[1]?.trim() || '';

/** Same make + model > same make > price within 20%; then same store, same state, closest price. */
export function rankSimilar(sold: SoldCartInfo, carts: PublicCart[], max = 6): PublicCart[] {
  const make = lc(sold.make);
  const model = lc(sold.model);
  const state = stateOf(sold.locationId);
  const scored = carts.filter((c) => c.id !== sold.id).map((c) => {
    const sameMake = !!make && lc(c.make) === make;
    const sameModel = sameMake && !!model && lc(c.model) === model;
    const inBand = sold.price > 0 && c.price > 0 && Math.abs(c.price - sold.price) <= sold.price * 0.2;
    const tier = sameModel ? 3 : sameMake ? 2 : inBand ? 1 : 0;
    const place = c.locationId === sold.locationId ? 2 : state && stateOf(c.locationId) === state ? 1 : 0;
    const diff = sold.price > 0 && c.price > 0 ? Math.abs(c.price - sold.price) : Number.MAX_SAFE_INTEGER;
    return {c, tier, place, diff, inBand};
  });
  scored.sort((a, b) => b.tier - a.tier || b.place - a.place || Number(b.inBand) - Number(a.inBand) ||
    Number(a.c.isUsed !== sold.isUsed) - Number(b.c.isUsed !== sold.isUsed) || a.diff - b.diff);
  return scored.slice(0, max).map((x) => x.c);
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

async function accountNames(): Promise<Map<string, string>> {
  const snap = await db().collection(C.accounts).get();
  return new Map(snap.docs.map((a) => [a.id, String(a.get('name') || a.id)]));
}

/** Poster uid → Facebook account names, from postedAccounts {accountId: {by, ts}}. */
function postersOf(data: Json, names: Map<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [accountId, entry] of Object.entries((data.postedAccounts || {}) as Json)) {
    const by = String(entry?.by || '');
    if (!by) continue;
    const list = out.get(by) || [];
    list.push(names.get(accountId) || 'a Facebook account');
    out.set(by, list);
  }
  return out;
}

async function openLeadsFor(cartId: string): Promise<Array<{id: string; data: Json}>> {
  const snap = await db().collection(C.leads).where('cartId', '==', cartId).get();
  return snap.docs.map((d) => ({id: d.id, data: d.data() as Json})).filter((l) => OPEN.has(String(l.data.status)));
}

const nameOf = (people: Person[], uid: string) => people.find((p) => p.uid === uid)?.name || '';
const keyPart = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);

/** Public cart page: a published storefront covering the cart's store, else the main TIGON storefront. */
async function cartLink(cartId: string, locationId: string): Promise<string> {
  let slug = 'tigon';
  try {
    const snap = await db().collection('mp_storefronts').where('published', '==', true).get();
    const hit = snap.docs.find((d) => {
      const ids = Array.isArray(d.get('locationIds')) ? (d.get('locationIds') as string[]) : [];
      return ids.length === 1 && ids[0] === locationId;
    });
    if (hit) slug = hit.id;
  } catch (e) {
    logger.warn('inventory: storefront lookup failed', e);
  }
  return `${PUBLIC_ORIGIN}/s/${slug}/${encodeURIComponent(cartId)}`;
}

export const similarUrl = (cartId: string) => `${PUBLIC_ORIGIN}/similar/${encodeURIComponent(cartId)}`;

// ---------------------------------------------------------------------------
// 11. Price drops
// ---------------------------------------------------------------------------

/** Texts open leads about the cart, makes call tasks for leads without a phone, tells posters to edit the price. */
export async function handlePriceChange(changeId: string, change: Json, s: SalesSettings): Promise<Json> {
  const cartId = String(change.cartId || '');
  if (!cartId) return {};
  const cartSnap = await db().collection(C.carts).doc(cartId).get();
  if (!cartSnap.exists || cartSnap.get('soldLocally') === true) return {skipped: 'cart gone or sold'};
  const cart = cartSnap.data() as Json;
  const sum = cartSummary(cart);
  const title = String(change.cartTitle || sum.title);
  const price = money(Number(change.newPrice) || sum.price);
  const was = money(Number(change.oldPrice) || 0);
  const [people, names, leads] = await Promise.all([loadPeople(), accountNames(), openLeadsFor(cartId)]);
  const now = Date.now();

  let leadsTexted = 0;
  let tasksCreated = 0;
  const link = await cartLink(cartId, sum.locationId || String(cart.locationId || ''));
  for (const {id, data: lead} of leads) {
    const owner = String(lead.ownerUid || '');
    const phone = e164(lead.phone);
    if (phone && lead.smsConsent !== false) {
      const body = fill(s.priceDrop.template, leadTemplateData(
        {...lead, cartTitle: lead.cartTitle || title, locationId: lead.locationId || sum.locationId},
        nameOf(people, owner), {price, link, oldPrice: was}));
      const sid = await queueSms({
        to: phone, body, kind: 'price_drop', storeId: String(lead.locationId || sum.locationId || ''), leadId: id,
        dedupeKey: `pd_${keyPart(changeId)}_${keyPart(id)}`,
      });
      if (sid) leadsTexted++;
    } else if (!phone && owner) {
      const ref = db().collection(C.tasks).doc(`pd_${keyPart(changeId)}_${keyPart(id)}`);
      try {
        await ref.create({
          ownerUid: owner, leadId: id, kind: 'price_drop',
          title: `Tell ${lead.name || 'your lead'} the price dropped: ${title} is now ${price} (was ${was})`,
          ...(lead.email ? {channel: 'email'} : {}),
          dueAt: now, status: 'open', createdAt: now,
        });
        tasksCreated++;
      } catch {
        // already created
      }
    }
  }

  const accountsToEdit: string[] = [];
  for (const [uid, accts] of postersOf(cart, names)) {
    accountsToEdit.push(...accts);
    await notify(uid, 'MP Price drop', `Update the price on ${accts.join(', ')}: ${title} is now ${price} (was ${was})`,
      {source: 'mp_price_drop', cartId}, `pd_${keyPart(changeId)}_${keyPart(uid)}`);
  }
  return {leadsTexted, tasksCreated, accountsToEdit: [...new Set(accountsToEdit)], alertedAt: now};
}

export const mpPriceChanged = onDocumentCreated(`${C.priceChanges}/{id}`, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const s = await loadSalesSettings();
  if (!s.priceDrop.enabled) {
    await snap.ref.set({leadsTexted: 0, accountsToEdit: [], alertsOff: true}, {merge: true});
    return;
  }
  try {
    const result = await handlePriceChange(event.params.id, snap.data() as Json, s);
    await snap.ref.set(result, {merge: true});
  } catch (e) {
    logger.error('mpPriceChanged failed', event.params.id, e);
  }
});

// ---------------------------------------------------------------------------
// 13. Sold carts: clean-up notices + similar carts for interested leads
// ---------------------------------------------------------------------------

/** Called by the DMS sync (before it deletes a sold cart) and by mpCartSold (marked sold in the app). Idempotent. */
export async function handleCartSold(cartId: string, data: Json, s: SalesSettings, via: 'dms' | 'app'): Promise<void> {
  const sum = cartSummary(data);
  const now = Date.now();
  const info: SoldCartInfo & Json = {
    id: cartId, title: sum.title, make: sum.make, model: sum.model, price: sum.price, isUsed: sum.isUsed,
    locationId: sum.locationId || String(data.locationId || ''), soldAt: now, via,
  };
  await db().collection(SOLD_CARTS).doc(cartId).set(info, {merge: true});

  const [people, names, leads] = await Promise.all([loadPeople(), accountNames(), openLeadsFor(cartId)]);
  for (const [uid, accts] of postersOf(data, names)) {
    await notify(uid, 'MP Sold', `SOLD: ${sum.title} — mark it sold or delete it on: ${accts.join(', ')}`,
      {source: 'mp_sold_cleanup', cartId}, `sold_${keyPart(cartId)}_${keyPart(uid)}`);
  }
  if (!s.soldSimilar.enabled) return;
  const link = similarUrl(cartId);
  for (const {id, data: lead} of leads) {
    const phone = e164(lead.phone);
    if (!phone || lead.smsConsent === false) continue;
    const body = fill(s.soldSimilar.template, leadTemplateData(
      {...lead, cartTitle: lead.cartTitle || sum.title, locationId: lead.locationId || info.locationId},
      nameOf(people, String(lead.ownerUid || '')), {link}));
    await queueSms({
      to: phone, body, kind: 'similar', storeId: String(lead.locationId || info.locationId || ''), leadId: id,
      dedupeKey: `sold_${keyPart(cartId)}_${keyPart(id)}`,
    });
  }
}

export const mpCartSold = onDocumentUpdated(`${C.carts}/{id}`, async (event) => {
  const before = event.data?.before.data() as Json | undefined;
  const after = event.data?.after.data() as Json | undefined;
  if (!before || !after) return;
  if (before.soldLocally === true || after.soldLocally !== true) return;
  try {
    await handleCartSold(event.params.id, after, await loadSalesSettings(), 'app');
  } catch (e) {
    logger.error('mpCartSold failed', event.params.id, e);
  }
});

/** GET /api/similar/<cartId> → {sold, similar[]} (public; no serials). */
export const mpSimilarApi = onRequest({region: REGION}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.status(204).send('');
    return;
  }
  const parts = req.path.split('/').filter(Boolean);
  const i = parts.indexOf('similar');
  const cartId = String(parts[i >= 0 ? i + 1 : 0] || '');
  if (req.method !== 'GET' || !/^[A-Za-z0-9_-]{1,128}$/.test(cartId)) {
    res.status(404).json({error: 'Not found'});
    return;
  }
  try {
    let sold: SoldCartInfo | null = null;
    const soldSnap = await db().collection(SOLD_CARTS).doc(cartId).get();
    if (soldSnap.exists) {
      const d = soldSnap.data() as Json;
      sold = {id: cartId, title: String(d.title || ''), make: String(d.make || ''), model: String(d.model || ''),
        price: Number(d.price) || 0, isUsed: d.isUsed === true, locationId: String(d.locationId || '')};
    } else {
      const cartSnap = await db().collection(C.carts).doc(cartId).get();
      if (cartSnap.exists) {
        const sum = cartSummary(cartSnap.data() as Json);
        sold = {id: cartId, title: sum.title, make: sum.make, model: sum.model, price: sum.price, isUsed: sum.isUsed,
          locationId: sum.locationId || String(cartSnap.get('locationId') || '')};
      }
    }
    const all = await allPublicCarts();
    const similar = sold ? rankSimilar(sold, all, 6) :
      all.filter((c) => c.photos.length).sort((a, b) => b.price - a.price).slice(0, 6);
    const store = sold ? STORE_BY_ID[sold.locationId] : undefined;
    res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.json({
      sold: sold ? {title: sold.title, location: store?.cityState || '', locationId: sold.locationId} : null,
      phone: store?.phone || STORE_BY_ID.T0.phone,
      similar,
    });
  } catch (e) {
    logger.error('mpSimilarApi failed', cartId, e);
    res.set('Cache-Control', 'no-store');
    res.status(500).json({error: 'Something went wrong'});
  }
});

// ---------------------------------------------------------------------------
// 12. Aged inventory — Monday manager summary
// ---------------------------------------------------------------------------

/** Once a day (New York morning). Mondays: "N aged carts at <store> (M over X days)" to each store's managers. */
export async function inventoryDaily(now: number, s: SalesSettings): Promise<void> {
  if (nyParts(now).weekday !== 'mon') return;
  const snap = await db().collection(C.carts).get();
  const perStore = new Map<string, {aged: number; urgent: number}>();
  for (const d of snap.docs) {
    const data = d.data() as Json;
    if (data.soldLocally === true || /delete/i.test(String(data.payload || ''))) continue;
    const stocked = Number(data.stockedAt) || Number(data.firstSeenAt) || Number(data.createdAt) || d.createTime?.toMillis() || 0;
    const level = agedLevel(daysOnLot(stocked, now), s.aged);
    if (!level) continue;
    const store = cartSummary(data).locationId || String(data.locationId || 'Other');
    const row = perStore.get(store) || {aged: 0, urgent: 0};
    row.aged++;
    if (level === 'urgent') row.urgent++;
    perStore.set(store, row);
  }
  if (!perStore.size) return;
  const people = await loadPeople();
  const perUid = new Map<string, string[]>();
  for (const [store, row] of [...perStore.entries()].sort((a, b) => b[1].aged - a[1].aged)) {
    const line = `${row.aged} aged cart${row.aged === 1 ? '' : 's'} at ${storeCity(store) || store}` +
      (row.urgent ? ` (${row.urgent} over ${s.aged.urgentDays} days)` : '');
    for (const m of managersFor(people, store)) {
      const list = perUid.get(m.uid) || [];
      list.push(line);
      perUid.set(m.uid, list);
    }
  }
  const day = nyDateKey(now);
  for (const [uid, lines] of perUid) {
    const text = lines.length === 1 ? `${lines[0]} — open Aged inventory` :
      `${lines.slice(0, 4).join('; ')}${lines.length > 4 ? `; +${lines.length - 4} more stores` : ''} — open Aged inventory`;
    await notify(uid, 'MP Aged inventory', text, {source: 'mp_aged', link: '/mp/aged'}, `aged_${day}_${keyPart(uid)}`);
  }
}
