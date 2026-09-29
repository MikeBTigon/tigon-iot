// CRM data layer: leads, customers, settings, contact links and the "mark sold" flow.
import { useEffect, useState } from 'react';
import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where,
} from 'firebase/firestore';
import Papa from 'papaparse';
import { db } from '../../config/firebase';
import { COLLECTIONS, DEALERSHIP_BY_ID } from '../constants';
import { useMp } from '../MpDataContext';
import { cartFromDoc } from '../cartUtils';
import { writeAudit } from '../audit';
import { logEvent } from '../../native/deviceSession';
import { isNativeApp } from '../../native/platform';
import { openExternal } from '../../native/actions';
import { isOpenStatus } from '../queue';
import type { MpCart, MpCartDoc, MpProfile, QueueItem } from '../types';
import type { Customer, Lead, LeadChannel, LeadStatus, MpSettings } from '../growthTypes';

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const CHANNEL_LABEL: Record<LeadChannel, string> = {
  facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', sms: 'Text', phone: 'Phone',
  email: 'Email', 'walk-in': 'Walk-in', website: 'Website', dba_website: 'DBA Website', other: 'Other',
};
export const CHANNELS = Object.keys(CHANNEL_LABEL) as LeadChannel[];

export const LEAD_STATUSES: LeadStatus[] = ['new', 'talking', 'sold', 'lost'];
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = { new: 'New', talking: 'Talking', sold: 'Sold', lost: 'Lost' };
export const LEAD_STATUS_COLOR: Record<LeadStatus, string> = {
  new: '#af1f31', talking: '#0e4671', sold: '#2e7d32', lost: '#757575',
};

/** Appended to every broadcast message. */
export const STOP_LINE = 'Reply STOP to opt out.';

export const isOpenLead = (s: LeadStatus) => s === 'new' || s === 'talking';
export const isManager = (p: MpProfile | null | undefined) => p?.role === 'admin' || p?.role === 'manager';
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || '';

/** Firestore rejects undefined values. */
export function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** Current time, refreshed every `ms` (keeps renders pure). */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export const endOfDay = (ts: number) => startOfDay(ts) + 86_400_000 - 1;

/** Value for <input type="datetime-local"> (local time). */
export function toLocalInput(ts: number | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const toDateInput = (ts: number) => toLocalInput(ts).slice(0, 10);
export const fromLocalInput = (s: string): number | undefined => (s ? new Date(s).getTime() || undefined : undefined);

export type FollowUpState = 'overdue' | 'today' | 'later';

/** Where an open lead's follow-up stands (null when none / closed). */
export function followUpState(lead: Pick<Lead, 'followUpAt' | 'status'>, now: number): FollowUpState | null {
  if (!lead.followUpAt || !isOpenLead(lead.status)) return null;
  if (lead.followUpAt < now) return 'overdue';
  if (lead.followUpAt <= endOfDay(now)) return 'today';
  return 'later';
}

export const shortDateTime = (ts: number) =>
  new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// ---------------------------------------------------------------------------
// Live data hooks
// ---------------------------------------------------------------------------

/** Leads the user may see: members their own (rules), managers everyone's. */
export function useLeads(profile: MpProfile | null | undefined, ownOnly = false): { leads: Lead[]; error: string } {
  const [state, setState] = useState<{ leads: Lead[]; error: string }>({ leads: [], error: '' });
  const uid = profile?.uid;
  const all = isManager(profile) && !ownOnly;
  useEffect(() => {
    if (!uid) return;
    const q = all
      ? collection(db, COLLECTIONS.leads)
      : query(collection(db, COLLECTIONS.leads), where('ownerUid', '==', uid));
    return onSnapshot(
      q,
      (snap) => setState({ leads: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Lead), error: '' }),
      (e) => setState({ leads: [], error: e.message }),
    );
  }, [uid, all]);
  return state;
}

/** Number of the signed-in user's own open leads whose follow-up is due today or overdue (for a nav badge). */
export function useDueFollowUps(): number {
  const { profile } = useMp();
  const { leads } = useLeads(profile, true);
  const now = useNow();
  return leads.filter((l) => {
    const s = followUpState(l, now);
    return s === 'overdue' || s === 'today';
  }).length;
}

/** All customers (shared by the team). */
export function useCustomers(profile: MpProfile | null | undefined): { customers: Customer[]; error: string } {
  const [state, setState] = useState<{ customers: Customer[]; error: string }>({ customers: [], error: '' });
  const uid = profile?.uid;
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(db, COLLECTIONS.customers),
      (snap) => setState({ customers: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Customer), error: '' }),
      (e) => setState({ customers: [], error: e.message }),
    );
  }, [uid]);
  return state;
}

const DEFAULT_SETTINGS: MpSettings = { requireApproval: false, relistAfterDays: 7 };

/** mp_settings/general with defaults (relistAfterDays 7). */
export function useMpSettings(enabled: boolean): MpSettings {
  const [settings, setSettings] = useState<MpSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, COLLECTIONS.settings, 'general'),
      (snap) => {
        const d = (snap.data() || {}) as Partial<MpSettings>;
        setSettings({ ...DEFAULT_SETTINGS, ...d, relistAfterDays: Number(d.relistAfterDays) > 0 ? Number(d.relistAfterDays) : 7 });
      },
      () => setSettings(DEFAULT_SETTINGS),
    );
  }, [enabled]);
  return settings;
}

/** A cart from the loaded inventory, or fetched (sold carts are not in the inventory list). */
export async function loadCart(carts: MpCart[], id: string | undefined): Promise<MpCart | null> {
  if (!id) return null;
  const hit = carts.find((c) => c.docId === id);
  if (hit) return hit;
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.carts, id));
    return snap.exists() ? cartFromDoc(id, snap.data() as MpCartDoc) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lead writes
// ---------------------------------------------------------------------------

export type LeadInput = Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>;

/** Creates a lead and logs `lead_created`. */
export async function createLead(profile: MpProfile, data: LeadInput): Promise<string> {
  const now = Date.now();
  const ref = await addDoc(collection(db, COLLECTIONS.leads), clean({ ...data, createdAt: now, updatedAt: now }));
  await logEvent(profile.uid, 'lead_created', { cartId: data.cartId });
  return ref.id;
}

export async function updateLead(id: string, patch: Partial<Lead> & Record<string, unknown>) {
  await updateDoc(doc(db, COLLECTIONS.leads, id), clean({ ...patch, updatedAt: Date.now() }));
}

/** Records a contact attempt: lastContactAt, and New → Talking. */
export async function markContacted(lead: Lead) {
  await updateLead(lead.id, { lastContactAt: Date.now(), ...(lead.status === 'new' ? { status: 'talking' as const } : {}) });
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export type CustomerInput = Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>;

/** Creates or updates a customer. Returns the id. */
export async function saveCustomer(profile: MpProfile, data: CustomerInput, id?: string): Promise<string> {
  const now = Date.now();
  if (id) {
    await updateDoc(doc(db, COLLECTIONS.customers, id), clean({ ...data, updatedAt: now }));
    return id;
  }
  const ref = await addDoc(collection(db, COLLECTIONS.customers), clean({ ...data, createdBy: profile.uid, createdAt: now, updatedAt: now }));
  return ref.id;
}

export const hasAnyConsent = (c: Pick<Customer, 'consentSms' | 'consentWhatsapp' | 'consentEmail'>) =>
  c.consentSms || c.consentWhatsapp || c.consentEmail;

/** Downloads customers as CSV (consent columns included). */
export function exportCustomersCsv(customers: Customer[]) {
  const iso = (ts?: number) => (ts ? new Date(ts).toISOString() : '');
  const csv = Papa.unparse(
    customers.map((c) => ({
      name: c.name, phone: c.phone, email: c.email, location: c.locationId, tags: (c.tags || []).join('; '),
      consent_sms: c.consentSms ? 'yes' : 'no', consent_whatsapp: c.consentWhatsapp ? 'yes' : 'no',
      consent_email: c.consentEmail ? 'yes' : 'no', consent_at: iso(c.consentAt), consent_source: c.consentSource || '',
      last_purchase: iso(c.lastPurchaseAt), review_requested: iso(c.reviewRequestedAt), created: iso(c.createdAt),
    })),
  );
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tigon-customers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------------------------------------------------------------------------
// Mark sold
// ---------------------------------------------------------------------------

export interface SoldInput {
  price: number;
  soldAt: number;
  /** Save/update a customer record with this consent. */
  customer?: Pick<Customer, 'consentSms' | 'consentWhatsapp' | 'consentEmail' | 'consentSource'> & { locationId: string };
}

export interface SoldResult {
  customerId?: string;
  cancelledQueue: number;
  /** Open queue items assigned to others that a member cannot cancel. */
  skippedQueue: number;
  warning: string;
}

/**
 * Marks a lead sold: lead status/price/date, the linked cart hidden from inventory (soldLocally),
 * its open queue items cancelled (all for managers, own for members), optional customer record.
 */
export async function markLeadSold(profile: MpProfile, lead: Lead, input: SoldInput): Promise<SoldResult> {
  const res: SoldResult = { cancelledQueue: 0, skippedQueue: 0, warning: '' };
  const now = Date.now();

  if (input.customer) {
    const { consentSms, consentWhatsapp, consentEmail, consentSource, locationId } = input.customer;
    const any = consentSms || consentWhatsapp || consentEmail;
    let existing: Customer | null = null;
    if (lead.customerId) {
      const snap = await getDoc(doc(db, COLLECTIONS.customers, lead.customerId));
      if (snap.exists()) existing = { id: snap.id, ...snap.data() } as Customer;
    }
    const tags = [...new Set([...(existing?.tags || []), 'buyer'])];
    res.customerId = await saveCustomer(
      profile,
      {
        name: lead.name, phone: lead.phone, email: lead.email,
        consentSms, consentWhatsapp, consentEmail,
        consentSource: any ? consentSource : existing?.consentSource,
        consentAt: any ? existing?.consentAt || now : existing?.consentAt,
        tags, locationId: locationId || existing?.locationId || '',
        lastPurchaseAt: input.soldAt, reviewRequestedAt: existing?.reviewRequestedAt,
      },
      existing?.id,
    );
  }

  await updateLead(lead.id, {
    status: 'sold', soldPrice: input.price, soldAt: input.soldAt,
    ...(res.customerId ? { customerId: res.customerId } : {}),
  });

  if (lead.cartId) {
    try {
      await updateDoc(doc(db, COLLECTIONS.carts, lead.cartId), { soldLocally: true, soldAt: input.soldAt, soldBy: profile.uid });
    } catch (e) {
      res.warning = `The cart could not be hidden from inventory (${e instanceof Error ? e.message : String(e)}).`;
    }
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.queue), where('cartId', '==', lead.cartId)));
      const manager = isManager(profile);
      for (const d of snap.docs) {
        const item = { id: d.id, ...d.data() } as QueueItem;
        if (!(isOpenStatus(item.status) || item.status === 'pending_approval')) continue;
        if (!manager && item.assignedUserId !== profile.uid) {
          res.skippedQueue++;
          continue;
        }
        await updateDoc(d.ref, { status: 'cancelled', updatedAt: now });
        res.cancelledQueue++;
      }
    } catch (e) {
      console.warn('Cancelling queue items failed', e);
    }
  }

  await logEvent(profile.uid, 'lead_sold', { cartId: lead.cartId });
  await writeAudit(profile, 'lead.sold', lead.id, `${lead.cartTitle || lead.name} · $${input.price.toLocaleString('en-US')}`);
  return res;
}

/** Stamps reviewRequestedAt on the customer and the lead (extra field on the lead). */
export async function recordReviewRequest(leadId: string | undefined, customerId: string | undefined) {
  const now = Date.now();
  if (customerId) await updateDoc(doc(db, COLLECTIONS.customers, customerId), { reviewRequestedAt: now, updatedAt: now });
  if (leadId) await updateLead(leadId, { reviewRequestedAt: now });
}

/** Google review link of a store (TIGON National's when the store has none). */
export const reviewLinkFor = (locationId: string | undefined) =>
  (locationId && DEALERSHIP_BY_ID[locationId]?.review) || DEALERSHIP_BY_ID.T0?.review || '';

// ---------------------------------------------------------------------------
// Contact links
// ---------------------------------------------------------------------------

export type ContactKind = 'call' | 'sms' | 'whatsapp' | 'email';

const digits = (phone: string) => phone.replace(/[^\d+]/g, '');
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

/** tel:/sms:/wa.me/mailto: link for a contact with a prefilled message. */
export function contactUrl(kind: ContactKind, to: { phone?: string; email?: string }, text: string, subject = 'TIGON Golf Carts'): string {
  const phone = digits(to.phone || '');
  const body = encodeURIComponent(text);
  switch (kind) {
    case 'call':
      return `tel:${phone}`;
    case 'sms':
      return `sms:${phone}${isIOS() ? '&' : '?'}body=${body}`;
    case 'whatsapp': {
      let n = phone.replace(/^\+/, '');
      if (n.length === 10) n = `1${n}`; // US numbers without country code
      return `https://wa.me/${n}?text=${body}`;
    }
    case 'email':
      return `mailto:${to.email || ''}?subject=${encodeURIComponent(subject)}&body=${body}`;
  }
}

/** Opens a contact link (native app launcher in the phone app). */
export async function openContact(url: string) {
  if (isNativeApp() || /^https?:/i.test(url)) {
    await openExternal(url);
    return;
  }
  window.location.href = url;
}
