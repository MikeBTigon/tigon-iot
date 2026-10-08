// Track 3 (closing tools) — shared client helpers: New York time, slots, labels, live Firestore reads, text templates.
import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { DEALERSHIP_BY_ID } from '../../constants';
import type { AppointmentStatus, PrequalStatus, SalesSettings, WeekDay } from '../salesTypes';

export const TZ = 'America/New_York';
export const DAY_MS = 86_400_000;

export const money = (n: number | undefined) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export const money0 = (n: number | undefined) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

// ---------------------------------------------------------------------------
// New York time (all TIGON stores are on Eastern time)
// ---------------------------------------------------------------------------

export function nyParts(ts: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(new Date(ts));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), hour: Number(get('hour')) % 24, minute: Number(get('minute')),
    weekday: get('weekday').toLowerCase().slice(0, 3) as WeekDay,
  };
}
const pad = (n: number) => String(n).padStart(2, '0');
export const nyDateKey = (ts: number) => {
  const p = nyParts(ts);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
/** ms for a New York wall-clock time ("2026-10-08", "14:30"). */
export function nyTime(dateKey: string, hhmm: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  const p = nyParts(guess);
  return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess);
}
export const nyHHMM = (ts: number) => {
  const p = nyParts(ts);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};
export const nyClock = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
export const nyDay = (ts: number) => new Date(ts).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
export const nyWhen = (ts: number) => `${nyDay(ts)} at ${nyClock(ts)}`;
/** "Thu, Oct 8" for a date key. */
export const dayLabel = (dateKey: string) => nyDay(nyTime(dateKey, '12:00'));
export const weekdayOf = (dateKey: string): WeekDay => nyParts(nyTime(dateKey, '12:00')).weekday;
export const addDays = (dateKey: string, n: number) => nyDateKey(nyTime(dateKey, '12:00') + n * DAY_MS);

const toMin = (hhmm: string) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
/** Slot start times for a New York date from the booking hours (same rule as the server). */
export function slotStarts(dateKey: string, b: SalesSettings['booking']): number[] {
  const h = b.hours?.[weekdayOf(dateKey)];
  if (!h) return [];
  const step = Math.min(Math.max(Math.round(Number(b.slotMinutes) || 30), 10), 240);
  const out: number[] = [];
  for (let m = toMin(h.open); m + step <= toMin(h.close); m += step) out.push(nyTime(dateKey, `${pad(Math.floor(m / 60))}:${pad(m % 60)}`));
  return out;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const KIND_LABEL: Record<string, string> = { test_drive: 'Test drive', visit: 'Visit', delivery: 'Delivery', service: 'Service' };
export const APPT_STATUS_LABEL: Record<AppointmentStatus, string> = { booked: 'Booked', showed: 'Showed', no_show: 'No-show', cancelled: 'Cancelled' };
export const APPT_STATUS_COLOR: Record<AppointmentStatus, 'primary' | 'success' | 'error' | 'default'> = {
  booked: 'primary', showed: 'success', no_show: 'error', cancelled: 'default',
};
export const PREQUAL_STATUSES: PrequalStatus[] = ['started', 'sent_to_lender', 'approved', 'declined', 'needs_info'];
export const PREQUAL_STATUS_LABEL: Record<PrequalStatus, string> = {
  started: 'Started', sent_to_lender: 'Sent to lender', approved: 'Approved', declined: 'Declined', needs_info: 'Needs info',
};
export const PREQUAL_STATUS_COLOR: Record<PrequalStatus, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  started: 'default', sent_to_lender: 'info', approved: 'success', declined: 'error', needs_info: 'warning',
};
export const CREDIT_RANGES = [
  { id: 'excellent', label: 'Excellent', hint: '720 or higher' },
  { id: 'good', label: 'Good', hint: '660 – 719' },
  { id: 'fair', label: 'Fair', hint: '600 – 659' },
  { id: 'building', label: 'Building', hint: 'Under 600 or not sure' },
] as const;
export const CREDIT_RANGE_LABEL: Record<string, string> = Object.fromEntries(CREDIT_RANGES.map((c) => [c.id, `${c.label} (${c.hint})`]));
export const TIER_OPTIONS = ['A', 'B', 'C', 'D', 'E'] as const;
export const TRADE_CONDITIONS = [
  { id: 'excellent', label: 'Excellent', hint: 'Looks almost new. No damage, everything works, strong batteries.' },
  { id: 'good', label: 'Good', hint: 'Normal wear. Small scratches, everything works.' },
  { id: 'fair', label: 'Fair', hint: 'Dents, torn seats or worn tires. Runs, may need some work.' },
  { id: 'poor', label: 'Needs work', hint: 'Does not run well or needs big repairs.' },
] as const;
export const TRADE_STATUS_LABEL: Record<string, string> = { new: 'New', appraised: 'Appraised', accepted: 'Accepted', declined: 'Declined' };

export const storeName = (id?: string) => (id && DEALERSHIP_BY_ID[id]?.name) || id || '';
export const storePhone = (id?: string) => (id && DEALERSHIP_BY_ID[id]?.phone) || '1-844-844-6638';
/** Real stores (T1…T14). */
export const STORE_IDS = Object.keys(DEALERSHIP_BY_ID).filter((id) => id !== 'T0');

/** Short random code for quote links (no look-alike characters, like the server's). */
export function randomCode(len = 8): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

// ---------------------------------------------------------------------------
// Live reads
// ---------------------------------------------------------------------------

type WithId<T> = T & { id: string };

/** One document, live (null while missing). */
export function useLiveDoc<T>(coll: string, id: string | undefined): WithId<T> | null {
  const [state, setState] = useState<{ id: string; data: WithId<T> | null }>({ id: '', data: null });
  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, coll, id), (s) => setState({ id, data: s.exists() ? ({ id: s.id, ...s.data() } as WithId<T>) : null }), () => setState({ id, data: null }));
  }, [coll, id]);
  return id && state.id === id ? state.data : null;
}

/** Newest documents of a collection by one field (single-field index), live. */
export function useRecent<T>(coll: string, field: string, n = 300, enabled = true): { rows: Array<WithId<T>>; error: string; loaded: boolean } {
  const [state, setState] = useState<{ rows: Array<WithId<T>>; error: string; loaded: boolean }>({ rows: [], error: '', loaded: false });
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      query(collection(db, coll), orderBy(field, 'desc'), limit(n)),
      (s) => setState({ rows: s.docs.map((d) => ({ id: d.id, ...d.data() }) as WithId<T>), error: '', loaded: true }),
      (e) => setState({ rows: [], error: e.message, loaded: true }),
    );
  }, [coll, field, n, enabled]);
  return state;
}

/** Documents where one field equals a value, live. */
export function useWhere<T>(coll: string, field: string, value: string | number | undefined): { rows: Array<WithId<T>>; error: string } {
  const [state, setState] = useState<{ key: string; rows: Array<WithId<T>>; error: string }>({ key: '', rows: [], error: '' });
  const key = value === undefined || value === '' ? '' : `${coll}|${field}|${value}`;
  useEffect(() => {
    if (value === undefined || value === '') return;
    const k = `${coll}|${field}|${value}`;
    return onSnapshot(
      query(collection(db, coll), where(field, '==', value)),
      (s) => setState({ key: k, rows: s.docs.map((d) => ({ id: d.id, ...d.data() }) as WithId<T>), error: '' }),
      (e) => setState({ key: k, rows: [], error: e.message }),
    );
  }, [coll, field, value]);
  return key && state.key === key ? state : { rows: [], error: '' };
}

// ---------------------------------------------------------------------------
// Text templates (salesperson texts a link)
// ---------------------------------------------------------------------------

export const TEXTS = {
  booking: 'Hi {first}, it\'s {salesperson} from TIGON Golf Carts {store}. Pick a time for a test drive — it only takes a minute: {link}',
  trade: 'Hi {first}, it\'s {salesperson} from TIGON {store}. Want to know what your golf cart is worth on trade? Get a value in 2 minutes: {link}',
  prequal: 'Hi {first}, it\'s {salesperson} from TIGON {store}. See what you qualify for in about 2 minutes — checking won\'t affect your credit: {link}',
  quote: 'Hi {first}, it\'s {salesperson} from TIGON Golf Carts {store}. Here is your price and payment options for the {cart}: {link}',
};
