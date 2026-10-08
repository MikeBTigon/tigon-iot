// "Sell more" release — shared server helpers (collections, New York time, notifications, people, templates).
import * as admin from 'firebase-admin';
import {STORE_BY_ID} from '../mpShare';
import type {Store} from '../mpShare';

export type Json = Record<string, any>;

export const C = {
  users: 'mp_users',
  leads: 'mp_leads',
  customers: 'mp_customers',
  carts: 'mp_carts',
  accounts: 'mp_accounts',
  devices: 'devices',
  notifications: 'notifications',
  meta: 'mp_meta',
  /** Text messages: the outbox and the log (one doc per text). */
  sms: 'mp_sms',
  /** Numbers that replied STOP (doc id = +1XXXXXXXXXX). */
  smsOptOut: 'mp_sms_optout',
  /** Replies received (Twilio, or the texting phone). */
  smsInbound: 'mp_sms_inbound',
  /** Follow-up to-dos (cadence steps, service reminders, call-backs). */
  tasks: 'mp_tasks',
  quotes: 'mp_quotes',
  appointments: 'mp_appointments',
  tradeIns: 'mp_trade_ins',
  prequal: 'mp_prequal',
  referrals: 'mp_referrals',
  priceChanges: 'mp_price_changes',
  reviews: 'mp_reviews',
} as const;

export const TZ = 'America/New_York';
export const MIN_MS = 60_000;
export const HOUR_MS = 60 * MIN_MS;
export const DAY_MS = 24 * HOUR_MS;
export const PUBLIC_ORIGIN = 'https://tigoniot.com';

export const db = () => admin.firestore();

/** Year/month/day/hour/minute/weekday of a moment in New York time. */
export function nyParts(ts: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    weekday: 'short', hourCycle: 'h23',
  }).formatToParts(new Date(ts));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
    hour: Number(get('hour')) % 24, minute: Number(get('minute')),
    weekday: get('weekday').toLowerCase().slice(0, 3) as 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat',
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-10-08" in New York. */
export const nyDateKey = (ts: number) => {
  const p = nyParts(ts);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

/** "Thu, Oct 8 at 2:30 PM" (New York). */
export const nyWhen = (ts: number) => new Date(ts).toLocaleString('en-US', {
  timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).replace(/, (\d+:\d+)/, ' at $1');

/** Milliseconds for a New York wall-clock time ("2026-10-08", "14:30"). Handles DST. */
export function nyTime(dateKey: string, hhmm: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  // Offset of New York from UTC at that moment (−4 h or −5 h).
  const p = nyParts(guess);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return guess - (asUtc - guess);
}

/** True when the New York hour is inside the quiet window (start > end wraps midnight, e.g. 21 → 8). */
export function isQuietHour(ts: number, start: number, end: number): boolean {
  if (start === end) return false;
  const h = nyParts(ts).hour;
  return start > end ? h >= start || h < end : h >= start && h < end;
}

/** Next moment after the quiet window ends (or `ts` if not quiet). */
export function afterQuiet(ts: number, start: number, end: number): number {
  if (!isQuietHour(ts, start, end)) return ts;
  let t = ts;
  for (let i = 0; i < 48 && isQuietHour(t, start, end); i++) t += 30 * MIN_MS;
  return t;
}

/** Firestore rejects undefined values. */
export function clean<T extends Json>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Commits writes in chunks below Firestore's 500-op batch limit. */
export async function commitAll(ops: Array<(b: admin.firestore.WriteBatch) => void>) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db().batch();
    for (const op of ops.slice(i, i + 400)) op(batch);
    await batch.commit();
  }
}

/** IoT notification (dashboard + phone push) for one person. `id` makes it idempotent. */
export async function notify(uid: string, from: string, text: string, extra: Json = {}, id?: string) {
  if (!uid) return;
  const data = {
    targetUserId: uid, sourceDeviceName: from, text: text.slice(0, 800), isHandled: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(), ...extra,
  };
  const ref = id ? db().collection(C.notifications).doc(id) : db().collection(C.notifications).doc();
  await ref.set(data, {merge: !!id});
}

export interface Person {uid: string; name: string; email: string; role: string; location: string}

/** Everyone on the MP team (mp_users). */
export async function loadPeople(): Promise<Person[]> {
  const snap = await db().collection(C.users).get();
  return snap.docs.map((d) => ({
    uid: d.id, name: String(d.get('name') || d.get('email') || 'Someone'), email: String(d.get('email') || ''),
    role: String(d.get('role') || 'sales'), location: String(d.get('location') || ''),
  }));
}

export const isManagerRole = (role: string) => role === 'admin' || role === 'manager';

/** Managers for a store (their location matches), else every manager/admin. */
export function managersFor(people: Person[], storeId?: string): Person[] {
  const all = people.filter((p) => isManagerRole(p.role));
  const local = storeId ? all.filter((p) => p.location === storeId) : [];
  return local.length ? local : all;
}

export const storeOf = (id: string | undefined): Store | undefined => (id ? STORE_BY_ID[id] : undefined);
/** "Hatfield" from "Hatfield, PA". */
export const storeCity = (id: string | undefined) => (storeOf(id)?.cityState || storeOf(id)?.name || '').split(',')[0];

/** "+12155550123" from any US number; '' if not 10 digits. */
export function e164(raw: unknown): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? `+1${d}` : '';
}

/** "+1-215-555-0123" display form. */
export const prettyPhone = (raw: unknown) => {
  const e = e164(raw);
  return e ? `+1-${e.slice(2, 5)}-${e.slice(5, 8)}-${e.slice(8)}` : String(raw || '');
};

export const firstName = (name: unknown) => String(name || '').trim().split(/\s+/)[0] || 'there';

/** Fills {placeholders}; unknown ones become ''. */
export function fill(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = data[k];
    return v === undefined || v === null ? '' : String(v);
  }).replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/** Template data for a lead: {first} {name} {cart} {store} {storePhone} {address} {salesperson}. */
export function leadTemplateData(lead: Json, ownerName = '', extra: Record<string, unknown> = {}) {
  const store = storeOf(lead.locationId);
  return {
    first: firstName(lead.name), name: lead.name || '', cart: lead.cartTitle || 'golf cart',
    store: storeCity(lead.locationId) || '', storePhone: store?.phone || '1-844-844-6638', address: store?.address || '',
    salesperson: ownerName ? ownerName.split(/\s+/)[0] : 'the TIGON team', ...extra,
  };
}

/** Short random code for public links (no look-alike characters). */
export function code(len = 8): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

/** Cart title + price from an mp_carts doc (DMS or manual payload). */
export function cartSummary(data: Json): {title: string; price: number; make: string; model: string; year: string; isUsed: boolean; locationId: string} {
  let p: Json = {};
  try {
    p = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload || {};
  } catch {
    p = {};
  }
  const src: Json = p.cart && typeof p.cart === 'object' ? p.cart : p;
  const type: Json = src.cartType || {};
  const attrs: Json = src.cartAttributes || {};
  const loc: Json = src.cartLocation || {};
  const make = String(type.make || src.make || '');
  const model = String(type.model || src.model || '');
  const year = String(type.year || src.year || '');
  const title = [year, make, model, attrs.cartColor || src.color].filter((s) => typeof s === 'string' && s.trim()).join(' ') ||
    `Cart ${data.serial || data.dmsId || ''}`.trim();
  return {
    title, price: Number(src.retailPrice) || 0, make, model, year, isUsed: data.isUsed === true,
    locationId: String(loc.locationId || loc.latestStoreId || data.locationId || ''),
  };
}
