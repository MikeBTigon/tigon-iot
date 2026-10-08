// "Sell more" release — shared client data helpers: settings, sending a text, public links, template filling.
import { useEffect, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { DEALERSHIP_BY_ID } from '../constants';
import { DEFAULT_SALES_SETTINGS } from './salesDefaults';
import { SALES_COLLECTIONS } from './salesTypes';
import type { SalesSettings, SmsKind } from './salesTypes';

type Json = Record<string, unknown>;

/** Customer-facing pages live on the main site. */
export const SALES_PUBLIC_ORIGIN = 'https://tigoniot.com';
export const quoteUrl = (code: string) => `${SALES_PUBLIC_ORIGIN}/q/${code}`;
export const bookUrl = (storeId?: string, leadId?: string) =>
  `${SALES_PUBLIC_ORIGIN}/book${storeId ? `/${storeId}` : ''}${leadId ? `?lead=${encodeURIComponent(leadId)}` : ''}`;
export const tradeUrl = (storeId?: string, leadId?: string) =>
  `${SALES_PUBLIC_ORIGIN}/trade${storeId || leadId ? '?' : ''}${[storeId ? `store=${storeId}` : '', leadId ? `lead=${encodeURIComponent(leadId)}` : ''].filter(Boolean).join('&')}`;
export const prequalUrl = (storeId?: string, leadId?: string) =>
  `${SALES_PUBLIC_ORIGIN}/prequal${storeId || leadId ? '?' : ''}${[storeId ? `store=${storeId}` : '', leadId ? `lead=${encodeURIComponent(leadId)}` : ''].filter(Boolean).join('&')}`;
export const referralUrl = (code: string) => `${SALES_PUBLIC_ORIGIN}/r/${code}`;

function merge<T>(base: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !base || typeof base !== 'object' || Array.isArray(base)) {
    return (saved === undefined || saved === null ? base : saved) as T;
  }
  const out: Json = { ...(base as Json) };
  for (const [k, v] of Object.entries(saved as Json)) {
    const b = (base as Json)[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) && Object.keys(b as Json).length && v && typeof v === 'object' && !Array.isArray(v)
      ? merge(b, v) : v;
  }
  return out as T;
}

/** mp_settings/sales merged over the defaults (live). */
export function useSalesSettings(): { settings: SalesSettings; loaded: boolean } {
  const [state, setState] = useState<{ settings: SalesSettings; loaded: boolean }>({ settings: DEFAULT_SALES_SETTINGS, loaded: false });
  useEffect(() => onSnapshot(
    doc(db, 'mp_settings', 'sales'),
    (s) => setState({ settings: merge(DEFAULT_SALES_SETTINGS, s.exists() ? s.data() : undefined), loaded: true }),
    () => setState({ settings: DEFAULT_SALES_SETTINGS, loaded: true }),
  ), []);
  return state;
}

/** Saves one section of the sales settings (admins). Whole section replaced. */
export async function saveSalesSection<K extends keyof SalesSettings>(key: K, value: SalesSettings[K]) {
  await setDoc(doc(db, 'mp_settings', 'sales'), { [key]: value, updatedAt: Date.now() }, { merge: true });
}

/** "+12155550123" from any US number; '' if not 10 digits. */
export function e164(raw: unknown): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? `+1${d}` : '';
}

/**
 * Queues a text from the signed-in person (sent by the store's texting phone or Twilio within about a minute).
 * Returns the mp_sms id, or throws when the number is not a US number.
 */
export async function sendText(input: { to: string; body: string; createdBy: string; storeId?: string; leadId?: string; customerId?: string; kind?: SmsKind }) {
  const to = e164(input.to);
  if (!to) throw new Error('Enter a 10-digit US phone number.');
  const body = input.body.trim();
  if (!body) throw new Error('Type a message.');
  const now = Date.now();
  const ref = await addDoc(collection(db, SALES_COLLECTIONS.sms), {
    to, body: body.slice(0, 1200), kind: input.kind || 'manual', storeId: input.storeId || '', createdBy: input.createdBy,
    status: 'queued', sendAt: now, attempts: 0, createdAt: now,
    ...(input.leadId ? { leadId: input.leadId } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
  });
  return ref.id;
}

export const firstName = (name: unknown) => String(name || '').trim().split(/\s+/)[0] || 'there';

/** Fills {placeholders}; unknown ones become ''. */
export function fill(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = data[k];
    return v === undefined || v === null ? '' : String(v);
  }).replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/** {first} {name} {cart} {store} {storePhone} {address} {salesperson} for a lead. */
export function leadTemplateData(lead: { name?: string; cartTitle?: string; locationId?: string }, salesperson = '', extra: Record<string, unknown> = {}) {
  const store = lead.locationId ? DEALERSHIP_BY_ID[lead.locationId] : undefined;
  return {
    first: firstName(lead.name), name: lead.name || '', cart: lead.cartTitle || 'golf cart',
    store: (store?.cityState || store?.name || '').split(',')[0], storePhone: store?.phone || '1-844-844-6638',
    address: store?.address || '', salesperson: salesperson ? salesperson.split(/\s+/)[0] : 'the TIGON team', ...extra,
  };
}
