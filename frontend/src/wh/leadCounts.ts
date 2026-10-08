// Webhook Flows — per-website lead counts taken from the submissions themselves (not the daily counters),
// so each number is exactly how many leads that website's forms sent. Spam and "Send test" leads don't count.
import { useEffect, useState } from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { WH } from './types';
import type { WhSubmission } from './types';
import { isSpamSub } from './submissionData';

export const isRealLead = (s: WhSubmission) => !isSpamSub(s) && !s.isTest;

/** Leads per website within the given submissions. */
export function countByDomain(subs: WhSubmission[] | undefined, since: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of subs || []) {
    if (!s.domainId || (s.receivedAt || 0) < since || !isRealLead(s)) continue;
    out[s.domainId] = (out[s.domainId] || 0) + 1;
  }
  return out;
}

/** All-time leads for one website: non-spam submissions minus test sends (equality filters only, no composite index). */
async function allTimeFor(domainId: string): Promise<number> {
  const c = collection(db, WH.submissions);
  const [ok, tests] = await Promise.all([
    getCountFromServer(query(c, where('domainId', '==', domainId), where('isSpam', '==', false))),
    getCountFromServer(query(c, where('domainId', '==', domainId), where('isTest', '==', true))),
  ]);
  return Math.max(0, ok.data().count - tests.data().count);
}

/** All-time lead count per website id (undefined while a site is still counting). */
export function useAllTimeLeads(domainIds: string[] | undefined) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const key = (domainIds || []).slice().sort().join(',');
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const ids = key.split(',');
    let next = 0;
    // A few at a time so a long website list doesn't fire hundreds of requests at once.
    const worker = async () => {
      while (alive && next < ids.length) {
        const id = ids[next++];
        try {
          const n = await allTimeFor(id);
          if (alive) setCounts((m) => ({ ...m, [id]: n }));
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : String(e));
        }
      }
    };
    void Promise.all(Array.from({ length: 6 }, worker));
    return () => { alive = false; };
  }, [key]);
  return { counts, error };
}
