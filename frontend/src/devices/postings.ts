// Marketplace postings per phone per New York day (Users page). A posting = a post_marked event, plus posted queue
// items that never logged one (same rule as MP Assistant → Analytics, so the numbers match).
import { collection, documentId, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../mp/constants';
import { readAll } from '../mp/firestorePaging';
import { buildOutcomes } from '../mp/analyticsUtils';
import type { MpEvent, QueueItem } from '../mp/types';
import { nySlot } from './presence';

/** deviceId ('web' = a computer) → date (YYYY-MM-DD) → posts. Loading everyone, keys are '<userId>|<deviceId>'. */
export type PostMap = Map<string, Map<string, number>>;

export const WEB_DEVICE = 'web';

/** One person's postings (or everyone's when uid is empty). */
export async function loadPostings(uid?: string): Promise<PostMap> {
  const ev = uid
    ? query(collection(db, COLLECTIONS.events), where('userId', '==', uid), where('type', '==', 'post_marked'), orderBy(documentId()))
    : query(collection(db, COLLECTIONS.events), where('type', '==', 'post_marked'), orderBy(documentId()));
  const qu = uid
    ? query(collection(db, COLLECTIONS.queue), where('assignedUserId', '==', uid), orderBy(documentId()))
    : query(collection(db, COLLECTIONS.queue), where('status', '==', 'posted'), orderBy(documentId()));
  const [events, queue] = await Promise.all([readAll(ev), readAll(qu)]);
  const outcomes = buildOutcomes(
    events.map((d) => ({ ...d.data(), id: d.id }) as MpEvent),
    queue.map((d) => ({ ...d.data(), id: d.id }) as QueueItem),
    0,
  );
  const out: PostMap = new Map();
  for (const o of outcomes) {
    if (o.kind !== 'posted' || !o.ts) continue;
    // Counted for whoever posted (phones can be moved to someone else later).
    const device = o.deviceId || WEB_DEVICE;
    const dev = uid ? device : `${o.userId}|${device}`;
    const date = nySlot(o.ts).date;
    if (!out.has(dev)) out.set(dev, new Map());
    const m = out.get(dev)!;
    m.set(date, (m.get(date) || 0) + 1);
  }
  return out;
}

export const postsOn = (m: PostMap, deviceId: string, date: string) => m.get(deviceId)?.get(date) || 0;
export const postsOver = (m: PostMap, deviceId: string, dates: string[]) => dates.reduce((s, d) => s + postsOn(m, deviceId, d), 0);
/** Postings made from devices that aren't on the given phone list (computer / old phones). */
export const otherDevices = (m: PostMap, phoneIds: string[]) => Array.from(m.keys()).filter((k) => !phoneIds.includes(k));
