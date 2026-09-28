// Loaders + counting for goals, leaderboard and badges. Queries follow firestore.rules:
// members only read their own events (userId) and leads (ownerUid); managers read everything.
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../constants';
import type { MpEvent } from '../types';
import type { Goal, Lead } from '../growthTypes';

const EVENT_LIMIT = 20000;

/** Posts, leads and sales counted for one person in one period. */
export interface Scores {
  posts: number;
  leads: number;
  sales: number;
}

export const emptyScores = (): Scores => ({ posts: 0, leads: 0, sales: 0 });

/** All of one person's events (equality filter only — no composite index needed). */
export async function loadUserEvents(uid: string): Promise<MpEvent[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.events), where('userId', '==', uid), limit(EVENT_LIMIT)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MpEvent);
}

/** All leads owned by one person. */
export async function loadUserLeads(uid: string): Promise<Lead[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.leads), where('ownerUid', '==', uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Lead);
}

/** Managers: every event in [start, end]. */
export async function loadTeamEvents(start: number, end: number): Promise<MpEvent[]> {
  const snap = await getDocs(query(
    collection(db, COLLECTIONS.events), where('ts', '>=', start), where('ts', '<=', end), limit(EVENT_LIMIT),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MpEvent);
}

/** Managers: leads created or sold since `start` (two single-field queries, merged). */
export async function loadTeamLeads(start: number): Promise<Lead[]> {
  const [created, sold] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.leads), where('createdAt', '>=', start))),
    getDocs(query(collection(db, COLLECTIONS.leads), where('soldAt', '>=', start))),
  ]);
  const map = new Map<string, Lead>();
  for (const d of [...created.docs, ...sold.docs]) map.set(d.id, { id: d.id, ...d.data() } as Lead);
  return [...map.values()];
}

/** Goals for a period key (everyone can read goals). */
export async function loadGoals(periodKey: string): Promise<Goal[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.goals), where('periodKey', '==', periodKey)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal);
}

const inRange = (ts: number | undefined, start: number, end: number) => !!ts && ts >= start && ts <= end;

/** Counts posts (post_marked), new leads and sales per user within [start, end]. */
export function scoresByUser(events: MpEvent[], leads: Lead[], start: number, end: number): Map<string, Scores> {
  const out = new Map<string, Scores>();
  const get = (uid: string) => {
    let s = out.get(uid);
    if (!s) out.set(uid, (s = emptyScores()));
    return s;
  };
  for (const e of events) if (e.type === 'post_marked' && inRange(e.ts, start, end)) get(e.userId).posts++;
  for (const l of leads) {
    if (!l.ownerUid) continue;
    if (inRange(l.createdAt, start, end)) get(l.ownerUid).leads++;
    if (l.status === 'sold' && inRange(l.soldAt, start, end)) get(l.ownerUid).sales++;
  }
  return out;
}

/** 0-100 progress toward a target (100 when there's no target but some activity). */
export function pct(value: number, target: number): number {
  if (!target) return value > 0 ? 100 : 0;
  return Math.min(100, Math.round((value / target) * 100));
}
