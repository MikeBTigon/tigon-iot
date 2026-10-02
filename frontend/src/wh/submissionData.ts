// Webhook Flows — counts and lists built from the submissions themselves (not the daily counters), so the
// overview numbers always match the lists they open and deleted leads disappear from both.
import { collection, orderBy, query, where } from 'firebase/firestore';
import type { QueryConstraint } from 'firebase/firestore';
import { db } from '../config/firebase';
import { readAll } from '../mp/firestorePaging';
import { WH } from './types';
import type { WhStepRun, WhSubmission } from './types';
import { dayLabel, nyDayKey } from './stats';
import type { StatsSummary } from './stats';

export const isSpamSub = (s: WhSubmission) => !!s.isSpam || s.status === 'spam';
export const isDupSub = (s: WhSubmission) => !isSpamSub(s) && (s.status === 'duplicate' || !!s.isDuplicate);

/** Same normalisation as the server's traffic-source keys. */
export const sourceKey = (s?: string) =>
  (String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)) || 'direct';

/** Steps that failed for good: stopped the lead ('failed') or ran out of retries ('dead'). */
export const FAILED_STEP_STATUSES: WhStepRun['status'][] = ['failed', 'dead'];

/** "YYYYMMDD" → "YYYY-MM-DD" (date input value). */
export const keyToDate = (k: string) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;

/** Totals over the given New York day keys, optionally for one website. */
export function summarizeSubs(
  subs: WhSubmission[] | undefined, runs: WhStepRun[] | undefined, keys: string[], domainId?: string, webhookIds?: Set<string>,
): StatsSummary {
  const days = new Set(keys);
  const perDay = new Map<string, number>();
  const s: StatsSummary = { total: 0, spam: 0, duplicate: 0, failedSteps: 0, series: [], byDomain: {}, byWebhook: {}, bySource: {} };
  for (const sub of subs || []) {
    const k = nyDayKey(sub.receivedAt || 0);
    if (!days.has(k) || (domainId && sub.domainId !== domainId)) continue;
    s.total++;
    perDay.set(k, (perDay.get(k) || 0) + 1);
    if (isSpamSub(sub)) { s.spam++; continue; }
    if (isDupSub(sub)) s.duplicate++;
    if (sub.domainId) s.byDomain[sub.domainId] = (s.byDomain[sub.domainId] || 0) + 1;
    if (sub.webhookId && (!webhookIds || webhookIds.has(sub.webhookId))) s.byWebhook[sub.webhookId] = (s.byWebhook[sub.webhookId] || 0) + 1;
    const src = sourceKey((sub as unknown as Record<string, string>).utm_source);
    s.bySource[src] = (s.bySource[src] || 0) + 1;
  }
  for (const r of runs || []) {
    if (!FAILED_STEP_STATUSES.includes(r.status)) continue;
    if (!days.has(nyDayKey(r.finishedAt || r.startedAt || 0)) || (domainId && r.domainId !== domainId)) continue;
    s.failedSteps++;
  }
  s.series = keys.map((k) => ({ key: k, label: dayLabel(k), count: perDay.get(k) || 0 }));
  return s;
}

/** Every submission received between the two times (newest first), read in pages — no 500 cap. */
export async function loadSubmissions(fromMs?: number, toMs?: number): Promise<WhSubmission[]> {
  const c: QueryConstraint[] = [];
  if (fromMs) c.push(where('receivedAt', '>=', fromMs));
  if (toMs && Number.isFinite(toMs)) c.push(where('receivedAt', '<=', toMs));
  c.push(orderBy('receivedAt', 'desc'));
  const docs = await readAll(query(collection(db, WH.submissions), ...c));
  return docs.map((d) => ({ ...d.data(), id: d.id }) as WhSubmission);
}
