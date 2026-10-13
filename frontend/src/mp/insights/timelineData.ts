// Insights — everything we know about one phone number, merged newest first (customer timeline).
// Firestore: only `==` / `in` filters (automatic single-field indexes). Salespeople add ownerUid / createdBy
// equality filters so the queries fit the security rules (they may only read their own leads and texts).
import { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where, type QueryConstraint } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { SALES_COLLECTIONS } from '../sales/salesTypes';
import { CHANNEL_LABEL } from '../crm/crmData';
import type { Lead, LeadChannel } from '../growthTypes';
import { phoneVariants, toE164 } from './phone';

type Json = Record<string, unknown> & { id: string };

export const CREDIT_APPS = 'mp_credit_apps';

export type TimelineKind = 'lead' | 'sold' | 'text_out' | 'text_in' | 'quote' | 'quote_open' | 'appointment' | 'trade' | 'prequal' | 'credit' | 'web';

export interface TimelineItem {
  key: string;
  kind: TimelineKind;
  at: number;
  title: string;
  detail: string;
  /** In-app path (or https URL). */
  link?: string;
}

export interface TimelineHeader {
  name: string;
  phone: string;
  email: string;
  storeId: string;
  ownerUid: string;
  leadId: string;
  consent: 'opted_out' | 'yes' | 'unknown';
}

export interface TimelineData {
  header: TimelineHeader;
  items: TimelineItem[];
  /** Raw text for AI summary: customer texts, lead notes, website comments. */
  customerText: string;
  leads: Array<Lead & Json>;
  loaded: boolean;
  /** Number of sources that could not be read (permissions / offline). */
  failed: number;
}

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown) => Number(v) || 0;
const money = (n: unknown) => `$${Math.round(num(n)).toLocaleString('en-US')}`;
const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function rows(col: string, ...constraints: QueryConstraint[]): Promise<Json[]> {
  const s = await getDocs(query(collection(db, col), ...constraints));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** One `in` query, or per-variant `==` queries when an owner filter must be added. */
async function byPhone(col: string, field: string, forms: string[], extra?: [string, string]): Promise<Json[]> {
  if (!forms.length) return [];
  if (!extra) return rows(col, where(field, 'in', forms.slice(0, 30)));
  const all = await Promise.all(forms.map((f) => rows(col, where(field, '==', f), where(extra[0], '==', extra[1]))));
  const seen = new Map<string, Json>();
  for (const r of all.flat()) seen.set(r.id, r);
  return [...seen.values()];
}

const APPT_KIND: Record<string, string> = { test_drive: 'Test drive', visit: 'Visit', delivery: 'Delivery', service: 'Service' };
const APPT_STATUS: Record<string, string> = { booked: 'booked', showed: 'showed up', no_show: 'no-show', cancelled: 'cancelled' };
const SMS_STATUS: Record<string, string> = { queued: 'waiting to send', sending: 'sending', sent: 'sent', failed: 'failed', skipped: 'not sent' };

export async function loadTimeline(raw: string, me: { uid: string; manager: boolean }, nameOf: (uid: string) => string): Promise<Omit<TimelineData, 'loaded'>> {
  const e = toE164(raw);
  const forms = phoneVariants(raw);
  const own: [string, string] | undefined = me.manager ? undefined : ['ownerUid', me.uid];
  let failed = 0;
  const safe = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => { failed++; return []; });
  const [leads, customers, outA, outB, ins, quotes, appts, trades, prequals, credits, subs, optout] = await Promise.all([
    safe(byPhone('mp_leads', 'phone', forms, own)),
    safe(byPhone('mp_customers', 'phone', forms)),
    safe(e ? (own ? rows(SALES_COLLECTIONS.sms, where('to', '==', e), where('ownerUid', '==', me.uid)) : rows(SALES_COLLECTIONS.sms, where('to', '==', e))) : Promise.resolve([])),
    safe(e && own ? rows(SALES_COLLECTIONS.sms, where('to', '==', e), where('createdBy', '==', me.uid)) : Promise.resolve([])),
    safe(byPhone(SALES_COLLECTIONS.smsInbound, 'from', forms)),
    safe(byPhone(SALES_COLLECTIONS.quotes, 'customerPhone', forms)),
    safe(byPhone(SALES_COLLECTIONS.appointments, 'phone', forms)),
    safe(byPhone(SALES_COLLECTIONS.tradeIns, 'phone', forms)),
    safe(byPhone(SALES_COLLECTIONS.prequal, 'phone', forms)),
    safe(e ? rows(CREDIT_APPS, where('phone', '==', e)) : Promise.resolve([])),
    safe(me.manager ? byPhone('wh_submissions', 'phone1', forms) : Promise.resolve([])),
    e ? getDoc(doc(db, SALES_COLLECTIONS.smsOptOut, e)).then((s) => s.exists()).catch(() => false) : Promise.resolve(false),
  ]);

  const items: TimelineItem[] = [];
  const push = (it: TimelineItem) => { if (it.at) items.push(it); };
  const texts: Array<{ at: number; text: string }> = [];

  for (const l of leads) {
    const ch = CHANNEL_LABEL[str(l.channel) as LeadChannel] || str(l.channel) || 'Lead';
    const src = str(l.source) && str(l.source) !== str(l.channel) ? ` · ${str(l.source).replace(/_/g, ' ')}` : '';
    push({
      key: `lead_${l.id}`, kind: 'lead', at: num(l.createdAt), title: `New lead (${ch}${src})`,
      detail: [str(l.cartTitle), nameOf(str(l.ownerUid)) ? `owner ${nameOf(str(l.ownerUid))}` : ''].filter(Boolean).join(' · '),
      link: `/mp/leads?lead=${encodeURIComponent(l.id)}`,
    });
    if (l.status === 'sold' && num(l.soldAt)) {
      push({
        key: `sold_${l.id}`, kind: 'sold', at: num(l.soldAt), title: `Sold${num(l.soldPrice) ? ` — ${money(l.soldPrice)}` : ''}`,
        detail: [str(l.cartTitle), nameOf(str(l.ownerUid))].filter(Boolean).join(' · '), link: `/mp/leads?lead=${encodeURIComponent(l.id)}`,
      });
    }
    if (str(l.notes)) texts.push({ at: num(l.updatedAt), text: `Lead notes: ${str(l.notes)}` });
  }
  const outs = new Map<string, Json>();
  for (const o of [...outA, ...outB]) outs.set(o.id, o);
  for (const o of outs.values()) {
    push({
      key: `out_${o.id}`, kind: 'text_out', at: num(o.sentAt) || num(o.createdAt),
      title: `Text to customer${nameOf(str(o.createdBy)) ? ` by ${nameOf(str(o.createdBy))}` : ''} (${SMS_STATUS[str(o.status)] || str(o.status)})`,
      detail: clip(str(o.body)), link: `/mp/inbox?phone=${encodeURIComponent(e)}`,
    });
  }
  for (const i of ins) {
    push({ key: `in_${i.id}`, kind: 'text_in', at: num(i.receivedAt), title: 'Text from customer', detail: clip(str(i.body)), link: `/mp/inbox?phone=${encodeURIComponent(e)}` });
    texts.push({ at: num(i.receivedAt), text: `Customer text: ${str(i.body)}` });
  }
  for (const q of quotes) {
    push({
      key: `quote_${q.id}`, kind: 'quote', at: num(q.createdAt), title: `Quote sent — ${money(q.otd)} out the door`,
      detail: [str(q.cartTitle), str(q.salespersonName)].filter(Boolean).join(' · '), link: `/q/${encodeURIComponent(str(q.code) || q.id)}`,
    });
    if (num(q.openedAt)) {
      push({
        key: `qopen_${q.id}`, kind: 'quote_open', at: num(q.openedAt), title: 'Customer opened the quote',
        detail: `${num(q.openCount) > 1 ? `Opened ${num(q.openCount)} times` : 'Opened once'}${num(q.interestedAt) ? ' · tapped "I\'m interested"' : ''}`,
        link: `/q/${encodeURIComponent(str(q.code) || q.id)}`,
      });
    }
  }
  for (const a of appts) {
    push({
      key: `appt_${a.id}`, kind: 'appointment', at: num(a.startAt),
      title: `${APPT_KIND[str(a.kind)] || 'Appointment'} — ${APPT_STATUS[str(a.status)] || str(a.status)}`,
      detail: [new Date(num(a.startAt)).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), str(a.cartTitle)]
        .filter(Boolean).join(' · '),
      link: '/mp/appointments',
    });
  }
  for (const t of trades) {
    push({
      key: `trade_${t.id}`, kind: 'trade', at: num(t.createdAt), title: `Trade-in: ${[str(t.year), str(t.brand), str(t.model)].filter(Boolean).join(' ')}`,
      detail: num(t.appraisedValue) ? `Appraised ${money(t.appraisedValue)}` : `Estimate ${money(t.estimateLow)}–${money(t.estimateHigh)}`, link: '/mp/trade-ins',
    });
  }
  for (const p of prequals) {
    push({
      key: `pq_${p.id}`, kind: 'prequal', at: num(p.createdAt), title: `Pre-qualification (${str(p.status).replace(/_/g, ' ')})`,
      detail: [`credit ${str(p.creditRange)}`, num(p.monthlyBudget) ? `${money(p.monthlyBudget)}/mo` : '', str(p.lender)].filter(Boolean).join(' · '),
      link: '/mp/prequal',
    });
  }
  for (const c of credits) {
    push({
      key: `credit_${c.id}`, kind: 'credit', at: num(c.createdAt), title: 'Credit application',
      detail: [`income ${money(c.monthlyIncome)}/mo`, str(c.cartWanted)].filter(Boolean).join(' · '), link: `/mp/credit-app?app=${encodeURIComponent(c.id)}`,
    });
    if (num(c.sentAt)) {
      const to = (c.sentTo || {}) as { name?: string; email?: string };
      push({ key: `credsent_${c.id}`, kind: 'credit', at: num(c.sentAt), title: `Credit application sent to ${to.name || to.email || 'a lender'}`, detail: str(c.sentByName), link: `/mp/credit-app?app=${encodeURIComponent(c.id)}` });
    }
  }
  for (const s of subs) {
    push({
      key: `web_${s.id}`, kind: 'web', at: num(s.receivedAt), title: `Website form${str(s.form_name) ? `: ${str(s.form_name)}` : ''}${s.isSpam ? ' (spam)' : ''}`,
      detail: clip(str(s.comments) || [str(s.brand), str(s.model)].filter(Boolean).join(' ')), link: `/wh/submissions/${encodeURIComponent(s.id)}`,
    });
    if (str(s.comments)) texts.push({ at: num(s.receivedAt), text: `Website message: ${str(s.comments)}` });
  }
  items.sort((a, b) => b.at - a.at);

  const lead = [...leads].sort((a, b) => num(b.updatedAt || b.createdAt) - num(a.updatedAt || a.createdAt))[0];
  const customer = customers[0];
  const sub = subs[0];
  const credit = credits[0];
  const consentYes = customers.some((c) => c.consentSms === true) || leads.some((l) => (l as Json).smsConsent === true);
  const header: TimelineHeader = {
    name: str(lead?.name) || str(customer?.name) || (sub ? `${str(sub.first_name)} ${str(sub.last_name)}`.trim() : '') ||
      (credit ? `${str(credit.firstName)} ${str(credit.lastName)}`.trim() : '') || str(appts[0]?.name) || str(quotes[0]?.customerName) || '',
    phone: e || raw,
    email: str(lead?.email) || str(customer?.email) || str(sub?.email) || str(credit?.email) || '',
    storeId: str(lead?.locationId) || str(customer?.locationId) || str(credit?.storeId) || str(appts[0]?.storeId) || '',
    ownerUid: str(lead?.ownerUid),
    leadId: lead?.id || '',
    consent: optout ? 'opted_out' : consentYes ? 'yes' : 'unknown',
  };
  const customerText = texts.sort((a, b) => a.at - b.at).map((t) => t.text).join('\n').slice(-12000);
  return { header, items, customerText, leads: leads as Array<Lead & Json>, failed };
}

/** Loads the timeline for a phone; `reload()` fetches again. */
export function useTimeline(phone: string, me: { uid: string; manager: boolean } | null, nameOf: (uid: string) => string) {
  const [state, setState] = useState<TimelineData & { phone: string }>({
    phone: '', header: { name: '', phone, email: '', storeId: '', ownerUid: '', leadId: '', consent: 'unknown' }, items: [], customerText: '', leads: [], loaded: false, failed: 0,
  });
  const [tick, setTick] = useState(0);
  const uid = me?.uid || '';
  const manager = !!me?.manager;
  useEffect(() => {
    if (!uid) return;
    let live = true;
    loadTimeline(phone, { uid, manager }, nameOf).then((d) => { if (live) setState({ ...d, phone, loaded: true }); })
      .catch(() => { if (live) setState((s) => ({ ...s, phone, loaded: true, failed: s.failed + 1 })); });
    return () => { live = false; };
    // nameOf changes identity with the users list; names are cosmetic, so do not refetch for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, uid, manager, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, loaded: state.loaded && state.phone === phone, reload };
}
