// Track 5 — client data helpers: referral codes, Google review snapshots, "Refresh now".
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../config/firebase';
import { DEALERSHIP_BY_ID } from '../../constants';
import { SALES_COLLECTIONS } from '../salesTypes';
import type { Referral, SalesSettings, StoreReviews } from '../salesTypes';
import { e164, fill, firstName, referralUrl } from '../salesData';
import { referralCodeFor } from './marketingCalc';

/** Extra fields this track keeps on mp_reviews docs (besides StoreReviews). */
export type StoreReviewsDoc = StoreReviews & { name?: string; googleMapsUri?: string };

/** Lead fields this track adds (besides LeadSalesFields.referralCode). */
export interface LeadReferralFields { myReferralCode?: string; referralRewardAt?: number; referralRewardAmount?: number }

/** Every referral code (live). */
export function useReferrals(enabled = true): { referrals: Referral[]; loaded: boolean; error: string } {
  const [state, setState] = useState<{ referrals: Referral[]; loaded: boolean; error: string }>({ referrals: [], loaded: false, error: '' });
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(db, SALES_COLLECTIONS.referrals),
      (snap) => setState({ referrals: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Referral), loaded: true, error: '' }),
      (e) => setState({ referrals: [], loaded: true, error: e.message }),
    );
  }, [enabled]);
  return state;
}

/** One referral code (live), or null. */
export function useReferral(code: string | undefined): Referral | null {
  const [ref, setRef] = useState<{ code: string; value: Referral | null }>({ code: '', value: null });
  useEffect(() => {
    if (!code) return;
    return onSnapshot(
      doc(db, SALES_COLLECTIONS.referrals, code),
      (s) => setRef({ code, value: s.exists() ? ({ id: s.id, ...s.data() } as Referral) : null }),
      () => setRef({ code, value: null }),
    );
  }, [code]);
  return code && ref.code === code ? ref.value : null;
}

/** Google review snapshots per store (live). */
export function useStoreReviews(): { reviews: StoreReviewsDoc[]; loaded: boolean; error: string } {
  const [state, setState] = useState<{ reviews: StoreReviewsDoc[]; loaded: boolean; error: string }>({ reviews: [], loaded: false, error: '' });
  useEffect(() => onSnapshot(
    collection(db, SALES_COLLECTIONS.reviews),
    (snap) => setState({ reviews: snap.docs.map((d) => ({ id: d.id, storeId: d.id, latest: [], ...d.data() }) as unknown as StoreReviewsDoc), loaded: true, error: '' }),
    (e) => setState({ reviews: [], loaded: true, error: e.message }),
  ), []);
  return state;
}

/** Creates a referral code (counters start at 0 — the rules require it). Returns the code. */
export async function createReferral(input: { name: string; phone: string; storeId?: string; leadId?: string; customerId?: string; createdBy: string }): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('Enter the customer\'s name.');
  const phone = e164(input.phone);
  if (!phone) throw new Error('Enter a 10-digit phone number.');
  for (let i = 0; i < 5; i++) {
    const code = referralCodeFor(name);
    const ref = doc(db, SALES_COLLECTIONS.referrals, code);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, {
      code, name, phone, createdBy: input.createdBy, leads: 0, sales: 0, rewardsOwed: 0, rewardsPaid: 0, createdAt: Date.now(),
      ...(input.storeId ? { storeId: input.storeId } : {}),
      ...(input.leadId ? { leadId: input.leadId } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
    });
    return code;
  }
  throw new Error('Could not make a code — try again.');
}

/** The text a customer gets with their link (settings.referral.template). */
export function referralMessage(s: SalesSettings, r: Pick<Referral, 'name' | 'code' | 'storeId'>): string {
  const store = r.storeId ? DEALERSHIP_BY_ID[r.storeId] : undefined;
  return fill(s.referral.template, {
    first: firstName(r.name), store: (store?.cityState || '').split(',')[0], reward: s.referral.rewardAmount, link: referralUrl(r.code),
  });
}

export interface RefreshResult { stores: number; errors: Array<{ storeId: string; error: string }>; message: string }

/** Refreshes every store's Google reviews now (managers). */
export async function refreshReviewsNow(): Promise<RefreshResult> {
  const res = await httpsCallable<unknown, RefreshResult>(functions, 'mpReviewsRefresh', { timeout: 120_000 })();
  return res.data;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
