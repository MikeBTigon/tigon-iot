// Track 5 — pure helpers (no Firebase): sales funnel math, Google post text, referral codes, date ranges.
// Tested with tsx (no browser needed).

/** The lead fields the funnel looks at. */
export interface FunnelLead {
  id: string;
  ownerUid?: string;
  locationId?: string;
  channel?: string;
  source?: string;
  status?: string;
  createdAt?: number;
  firstResponseAt?: number;
  lastContactAt?: number;
  responseMinutes?: number;
  appointmentId?: string;
  appointmentAt?: number;
  testDriveAt?: number;
  quoteSentAt?: number;
  soldPrice?: number;
}

export const FUNNEL_STAGES = [
  { id: 'leads', label: 'Leads' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'appointment', label: 'Appointment' },
  { id: 'testDrive', label: 'Test drive' },
  { id: 'quote', label: 'Quote sent' },
  { id: 'sold', label: 'Sold' },
] as const;
export type StageId = typeof FUNNEL_STAGES[number]['id'];

/**
 * How far a lead got (0 = Leads … 5 = Sold). A lead that reached a later step counts for every earlier step too
 * (a sold lead with no recorded test drive still counts as "Test drive"), so each bar is never bigger than the one before.
 */
export function stageReached(l: FunnelLead): number {
  if (l.status === 'sold') return 5;
  if (l.quoteSentAt) return 4;
  if (l.testDriveAt) return 3;
  if (l.appointmentId || l.appointmentAt) return 2;
  if (l.firstResponseAt || l.lastContactAt || l.status === 'talking') return 1;
  return 0;
}

export interface FunnelRow {
  key: string;
  leads: number;
  contacted: number;
  appointments: number;
  testDrives: number;
  quotes: number;
  sold: number;
  revenue: number;
  /** Average first-response minutes (leads with a recorded response). */
  avgResponse: number | null;
  /** Counts per stage, same order as FUNNEL_STAGES. */
  stages: number[];
}

function emptyRow(key: string): FunnelRow {
  return { key, leads: 0, contacted: 0, appointments: 0, testDrives: 0, quotes: 0, sold: 0, revenue: 0, avgResponse: null, stages: [0, 0, 0, 0, 0, 0] };
}

function rowOf(key: string, leads: FunnelLead[]): FunnelRow {
  const r = emptyRow(key);
  let respSum = 0;
  let respN = 0;
  for (const l of leads) {
    const st = stageReached(l);
    for (let i = 0; i <= st; i++) r.stages[i]++;
    if (l.status === 'sold') r.revenue += Number(l.soldPrice) || 0;
    if (typeof l.responseMinutes === 'number' && Number.isFinite(l.responseMinutes) && l.responseMinutes >= 0) {
      respSum += l.responseMinutes;
      respN++;
    }
  }
  [r.leads, r.contacted, r.appointments, r.testDrives, r.quotes, r.sold] = r.stages;
  r.avgResponse = respN ? Math.round(respSum / respN) : null;
  return r;
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export interface FunnelResult {
  total: FunnelRow;
  /** Conversion from the previous stage (index 0 = 100). */
  stepRates: number[];
  overallRate: number;
  /** Stage pair that loses the most leads, or null when there is nothing to compare. */
  biggestDrop: { from: string; to: string; lost: number; rate: number } | null;
  byPerson: FunnelRow[];
  byStore: FunnelRow[];
  bySource: FunnelRow[];
}

function groupRows(leads: FunnelLead[], keyOf: (l: FunnelLead) => string): FunnelRow[] {
  const groups = new Map<string, FunnelLead[]>();
  for (const l of leads) {
    const k = keyOf(l);
    groups.set(k, [...(groups.get(k) || []), l]);
  }
  return [...groups.entries()].map(([k, ls]) => rowOf(k, ls)).sort((a, b) => b.leads - a.leads || b.sold - a.sold);
}

export interface FunnelFilter { start: number; end: number; storeId?: string; ownerUid?: string }

/** Lead's source for the "by source" table: detailed source, else channel. */
export const sourceOf = (l: FunnelLead) => l.source || l.channel || 'other';

/** Filters leads to the period/store/person and builds every table. */
export function computeFunnel(all: FunnelLead[], f: FunnelFilter, storeOfOwner: (uid: string) => string = () => ''): FunnelResult {
  const storeOf = (l: FunnelLead) => l.locationId || storeOfOwner(l.ownerUid || '') || '';
  const leads = all.filter((l) => {
    const t = Number(l.createdAt) || 0;
    if (t < f.start || t > f.end) return false;
    if (f.storeId && storeOf(l) !== f.storeId) return false;
    if (f.ownerUid && l.ownerUid !== f.ownerUid) return false;
    return true;
  });
  const total = rowOf('all', leads);
  const stepRates = total.stages.map((n, i) => (i === 0 ? 100 : pct(n, total.stages[i - 1])));
  let biggestDrop: FunnelResult['biggestDrop'] = null;
  for (let i = 1; i < total.stages.length; i++) {
    const lost = total.stages[i - 1] - total.stages[i];
    if (lost > 0 && (!biggestDrop || lost > biggestDrop.lost)) {
      biggestDrop = { from: FUNNEL_STAGES[i - 1].label, to: FUNNEL_STAGES[i].label, lost, rate: stepRates[i] };
    }
  }
  return {
    total, stepRates, overallRate: pct(total.sold, total.leads), biggestDrop,
    byPerson: groupRows(leads, (l) => l.ownerUid || ''),
    byStore: groupRows(leads, storeOf),
    bySource: groupRows(leads, sourceOf),
  };
}

export const SOURCE_LABEL: Record<string, string> = {
  website: 'Website', dba_website: 'DBA website', facebook: 'Facebook', facebook_message: 'Facebook message',
  missed_call: 'Missed call', referral: 'Referral', 'walk-in': 'Walk-in', phone: 'Phone call', sms: 'Text',
  email: 'Email', instagram: 'Instagram', whatsapp: 'WhatsApp', quote: 'Quote link', booking: 'Online booking',
  trade_in: 'Trade-in form', prequal: 'Pre-qualification', other: 'Other',
};
export const sourceLabel = (k: string) => SOURCE_LABEL[k] || k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export type PeriodId = 'week' | 'month' | '30' | '90' | 'custom';

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Start/end (ms, local time) of a period. Custom uses "YYYY-MM-DD" from/to. */
export function periodRange(p: PeriodId, now: number, from?: string, to?: string): { start: number; end: number } {
  const today = startOfDay(now);
  if (p === 'week') {
    const d = new Date(today);
    const back = (d.getDay() + 6) % 7; // Monday
    return { start: today - back * 86_400_000, end: now };
  }
  if (p === 'month') {
    const d = new Date(today);
    return { start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), end: now };
  }
  if (p === '30' || p === '90') return { start: today - (Number(p) - 1) * 86_400_000, end: now };
  const s = from ? new Date(`${from}T00:00:00`).getTime() : today - 29 * 86_400_000;
  const e = to ? new Date(`${to}T23:59:59.999`).getTime() : now;
  return { start: Number.isFinite(s) ? s : today, end: Number.isFinite(e) ? e : now };
}

// ---------------------------------------------------------------------------
// Google Business Profile post
// ---------------------------------------------------------------------------

export interface PostCart {
  year?: string;
  make?: string;
  model?: string;
  color?: string;
  price?: number;
  isLifted?: boolean;
  hasSoundSystem?: boolean;
  passengers?: number;
  isElectric?: boolean;
  batteryType?: string;
  isStreetLegal?: boolean;
  hasExtendedTop?: boolean;
  tireRimSize?: string;
  seatColor?: string;
  isUsed?: boolean;
}

/** Up to 3 selling points for a cart. */
export function cartFeatures(c: PostCart): string[] {
  const f: string[] = [];
  if (c.passengers && c.passengers >= 2) f.push(`${c.passengers} seats`);
  if (c.isElectric && /lith/i.test(c.batteryType || '')) f.push('lithium battery');
  else if (c.isElectric) f.push('electric');
  if (c.isLifted) f.push('lifted');
  if (c.isStreetLegal) f.push('street legal');
  if (c.hasSoundSystem) f.push('sound system');
  if (c.tireRimSize) f.push(`${String(c.tireRimSize).replace(/["”]+$/, '')}" wheels`);
  if (c.hasExtendedTop) f.push('extended top');
  if (c.seatColor) f.push(`${c.seatColor.toLowerCase()} seats`);
  if (!f.length) f.push(c.isUsed ? 'inspected and ready to go' : 'brand new');
  return f.slice(0, 3);
}

/** "Just arrived at TIGON Golf Carts Hatfield: 2025 Evolution Classic 4 Pro Blue — 4 seats, lithium battery, lifted. $12,995. …" (≤ 1500). */
export function googlePostText(c: PostCart, city: string, phone: string): string {
  const title = [c.year, c.make, c.model, c.color].filter((s) => s && String(s).trim()).join(' ') || 'a new golf cart';
  const price = c.price && c.price > 0 ? ` $${Math.round(c.price).toLocaleString('en-US')}.` : '';
  const text = `Just arrived at TIGON Golf Carts${city ? ` ${city}` : ''}: ${title} — ${cartFeatures(c).join(', ')}.${price} Financing available. Call ${phone}.`;
  return text.slice(0, 1500);
}

/** Arrival time: when the cart was first seen (if recorded), else when it was last saved. */
export const arrivedAt = (c: { firstSeenAt?: number; savedAt?: number }) => Number(c.firstSeenAt ?? c.savedAt) || 0;

// ---------------------------------------------------------------------------
// Referral codes (same rule as the server: first name + 4 random characters)
// ---------------------------------------------------------------------------

export function referralCodeFor(name: string, rand: () => number = Math.random): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const first = String(name || '').trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 12) || 'friend';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc[Math.floor(rand() * abc.length)];
  return `${first}${s}`;
}
