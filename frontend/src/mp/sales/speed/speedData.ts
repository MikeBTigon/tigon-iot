// Track 1 (speed to lead) — data for the Today list, claiming, and Facebook-message counts.
import { useEffect, useState } from 'react';
import { collection, deleteField, doc, onSnapshot, query, updateDoc, where, type Query } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../constants';
import { endOfDay, startOfDay } from '../../crm/crmData';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { Appointment, SalesTask } from '../salesTypes';
import { firstResponsePatch, isAnswered, type SpeedLead } from './speedUtil';

type Live<T> = { key: string; items: T[]; error: string; loaded: boolean };

/** Live query, re-subscribed when `key` changes; returns [] until the first snapshot for this key. */
function useLive<T>(key: string, make: (() => Query) | null): Live<T> {
  const [state, setState] = useState<Live<T>>({ key: '', items: [], error: '', loaded: false });
  useEffect(() => {
    if (!make) return;
    return onSnapshot(
      make(),
      (snap) => setState({ key, items: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), error: '', loaded: true }),
      (e) => setState({ key, items: [], error: e.message, loaded: true }),
    );
    // `key` identifies the query; `make` is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : { key, items: [], error: '', loaded: false };
}

/** One person's leads (members: their own; managers may look at anyone). */
export function useLeadsOf(uid: string | undefined) {
  return useLive<SpeedLead>(`leads:${uid || ''}`, uid ? () => query(collection(db, COLLECTIONS.leads), where('ownerUid', '==', uid)) : null);
}

/** One person's to-dos (all statuses; filter in memory). */
export function useTasksOf(uid: string | undefined) {
  return useLive<SalesTask>(`tasks:${uid || ''}`, uid ? () => query(collection(db, SALES_COLLECTIONS.tasks), where('ownerUid', '==', uid)) : null);
}

/** Appointments from the start of today on (filter the end in memory). */
export function useAppointmentsFrom(dayStart: number, enabled = true) {
  return useLive<Appointment>(`appts:${dayStart}:${enabled}`, enabled
    ? () => query(collection(db, SALES_COLLECTIONS.appointments), where('startAt', '>=', dayStart)) : null);
}

/** Leads about one cart (managers: everyone's; members: their own). */
export function useCartLeads(cartId: string, uid: string | undefined, manager: boolean) {
  return useLive<SpeedLead>(`cart:${cartId}:${manager ? 'all' : uid || ''}`, !cartId || !uid ? null : manager
    ? () => query(collection(db, COLLECTIONS.leads), where('cartId', '==', cartId))
    : () => query(collection(db, COLLECTIONS.leads), where('ownerUid', '==', uid)));
}

/** How many people asked about each cart on Facebook (server-kept counter, readable by the whole team). */
export function useFbAskCount(cartId: string): number {
  const [state, setState] = useState<{ id: string; n: number }>({ id: '', n: 0 });
  useEffect(() => onSnapshot(
    doc(db, 'mp_meta', 'sales_fb_asks'),
    (s) => setState({ id: cartId, n: Number(s.get(cartId)) || 0 }),
    () => setState({ id: cartId, n: 0 }),
  ), [cartId]);
  return state.id === cartId ? state.n : 0;
}

/** "I've got it": stops the claim timer and starts the response clock. */
export async function claimLead(lead: SpeedLead) {
  const now = Date.now();
  await updateDoc(doc(db, COLLECTIONS.leads, lead.id), {
    ...firstResponsePatch(lead, now), claimedAt: now, claimDeadline: deleteField(), updatedAt: now,
  });
}

export async function setTaskStatus(task: SalesTask, status: 'done' | 'skipped') {
  await updateDoc(doc(db, SALES_COLLECTIONS.tasks, task.id), { status, doneAt: Date.now() });
}

// ---------------------------------------------------------------------------
// The Today list
// ---------------------------------------------------------------------------

export type TodaySection = 'new' | 'followup' | 'tasks' | 'quotes' | 'appts';

export const SECTION_LABEL: Record<TodaySection, string> = {
  new: 'New leads — not contacted yet',
  followup: 'Follow-ups due',
  tasks: 'To-dos',
  quotes: 'Opened your quote — no reply yet',
  appts: 'Appointments today',
};

export interface TodayRow {
  key: string;
  section: TodaySection;
  title: string;
  detail: string;
  phone: string;
  /** When it's due / happened (for sorting and display). */
  at: number;
  lead?: SpeedLead;
  task?: SalesTask;
  appt?: Appointment;
}

export interface TodayList {
  rows: Record<TodaySection, TodayRow[]>;
  counts: Record<TodaySection, number>;
  total: number;
}

const isOpen = (l: SpeedLead) => l.status === 'new' || l.status === 'talking';
const who = (l: { name?: string; phone?: string; email?: string }) => l.name || l.phone || l.email || 'Customer';

/** Builds one person's list for today from their leads, tasks and today's appointments. */
export function buildToday(uid: string, storeId: string, leads: SpeedLead[], tasks: SalesTask[], appts: Appointment[], now: number): TodayList {
  const end = endOfDay(now);
  const start = startOfDay(now);
  const open = leads.filter((l) => l.ownerUid === uid && isOpen(l));
  const byId = new Map(leads.map((l) => [l.id, l]));
  const rows: Record<TodaySection, TodayRow[]> = { new: [], followup: [], tasks: [], quotes: [], appts: [] };

  for (const l of open) {
    const base = { title: who(l), phone: l.phone || '', lead: l };
    if (l.status === 'new' && !isAnswered(l)) {
      rows.new.push({ ...base, key: `n_${l.id}`, section: 'new', detail: l.cartTitle || '', at: l.createdAt });
    }
    if (l.followUpAt && l.followUpAt <= end) {
      rows.followup.push({ ...base, key: `f_${l.id}`, section: 'followup', detail: l.cartTitle || '', at: l.followUpAt });
    }
    if (l.quoteOpenedAt && !((l.lastContactAt || 0) > l.quoteOpenedAt)) {
      rows.quotes.push({ ...base, key: `q_${l.id}`, section: 'quotes', detail: l.cartTitle || 'Quote', at: l.quoteOpenedAt });
    }
  }
  for (const t of tasks) {
    if (t.ownerUid !== uid || t.status !== 'open' || !(t.dueAt <= end)) continue;
    const lead = t.leadId ? byId.get(t.leadId) : undefined;
    rows.tasks.push({
      key: `t_${t.id}`, section: 'tasks', title: t.title || (lead ? who(lead) : 'To-do'),
      detail: lead ? who(lead) : '', phone: t.phone || lead?.phone || '', at: t.dueAt, task: t, lead,
    });
  }
  for (const a of appts) {
    if (a.startAt < start || a.startAt > end || a.status === 'cancelled') continue;
    const lead = a.leadId ? byId.get(a.leadId) : undefined;
    const mine = a.ownerUid ? a.ownerUid === uid : lead ? lead.ownerUid === uid : !!storeId && a.storeId === storeId;
    if (!mine) continue;
    rows.appts.push({
      key: `a_${a.id}`, section: 'appts', title: a.name || 'Visit', phone: a.phone || lead?.phone || '',
      detail: [new Date(a.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), a.cartTitle].filter(Boolean).join(' · '),
      at: a.startAt, appt: a, lead,
    });
  }
  (Object.keys(rows) as TodaySection[]).forEach((k) => rows[k].sort((a, b) => a.at - b.at));
  const counts = Object.fromEntries((Object.keys(rows) as TodaySection[]).map((k) => [k, rows[k].length])) as Record<TodaySection, number>;
  return { rows, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

/** Live Today list for one person. */
export function useToday(uid: string | undefined, storeId: string, now: number) {
  const leads = useLeadsOf(uid);
  const tasks = useTasksOf(uid);
  const dayStart = startOfDay(now);
  const appts = useAppointmentsFrom(dayStart, !!uid);
  const list = buildToday(uid || '', storeId, leads.items, tasks.items, appts.items, now);
  return {
    list, leads: leads.items, loaded: leads.loaded,
    // Tasks/appointments are added by other features — a missing permission there shouldn't hide the leads.
    error: leads.error,
  };
}
