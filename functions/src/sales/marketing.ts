// Track 5 — Marketing & managers (ideas 16, 17, 18): Google reviews + new-arrival posts, referral program, sales funnel.
// The funnel is computed in the browser (frontend/src/mp/sales/marketing/marketingCalc.ts); the server keeps the Google
// review snapshots (mp_reviews) and the referral codes and rewards (mp_referrals).
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {loadSalesSettings} from './settings';
import type {SalesSettings} from './settings';
import {
  C, DAY_MS, PUBLIC_ORIGIN, clean, code, db, e164, fill, firstName, isManagerRole, loadPeople, managersFor,
  nyDateKey, notify, prettyPhone, storeCity, storeOf,
} from './util';
import type {Json, Person} from './util';
import {PublicError} from './publicTypes';
import type {PublicHandler} from './publicTypes';

// ===========================================================================
// 16. Google reviews (Places API (New) — Place Details)
// ===========================================================================

export const PLACES_FIELDS = 'rating,userRatingCount,reviews,googleMapsUri,displayName';
export const NO_KEY_ERROR = 'Google Places key not set';

export interface ParsedReview {id: string; author: string; rating: number; text: string; time: number; uri?: string}
export interface ParsedPlace {rating: number; count: number; mapsUri: string; name: string; reviews: ParsedReview[]}
export interface HistoryPoint {date: string; count: number; rating: number}

/** Place Details (New) JSON → what we keep. Reviews newest first. */
export function parsePlaceDetails(json: Json): ParsedPlace {
  const reviews: ParsedReview[] = (Array.isArray(json.reviews) ? json.reviews : []).map((r: Json) => {
    const time = Date.parse(String(r.publishTime || '')) || 0;
    const author = String(r.authorAttribution?.displayName || 'A Google user');
    const text = String(r.text?.text || r.originalText?.text || '');
    // `name` is "places/<placeId>/reviews/<reviewId>"; fall back to author + time.
    const id = String(r.name || `${author}_${time}`);
    return clean({
      id, author, rating: Number(r.rating) || 0, text: text.slice(0, 1500), time,
      uri: r.googleMapsUri ? String(r.googleMapsUri) : undefined,
    }) as ParsedReview;
  }).sort((a: ParsedReview, b: ParsedReview) => b.time - a.time);
  return {
    rating: Number(json.rating) || 0,
    count: Number(json.userRatingCount) || 0,
    mapsUri: String(json.googleMapsUri || ''),
    name: String(json.displayName?.text || ''),
    reviews,
  };
}

/** Adds/replaces today's point and keeps the last 40 days. */
export function updateHistory(history: HistoryPoint[] | undefined, date: string, count: number, rating: number): HistoryPoint[] {
  const rest = (Array.isArray(history) ? history : []).filter((h) => h && h.date !== date);
  return [...rest, {date, count, rating}].sort((a, b) => a.date.localeCompare(b.date)).slice(-40);
}

/** Review count on the newest history day at least `days` ago (undefined if the history is too short). */
export function countDaysAgo(history: HistoryPoint[], now: number, days: number): number | undefined {
  const cutoff = nyDateKey(now - days * DAY_MS);
  const older = history.filter((h) => h.date <= cutoff);
  return older.length ? older[older.length - 1].count : undefined;
}

/** Reviews not seen before (by id, or newer than the newest seen time). */
export function newReviews(reviews: ParsedReview[], seenIds: string[], lastSeenTime: number): ParsedReview[] {
  const seen = new Set(seenIds);
  return reviews.filter((r) => !seen.has(r.id) && r.time > lastSeenTime - 7 * DAY_MS);
}

const stars = (n: number) => `${Math.round(n)}★`;

type Fetcher = (url: string, init: {headers: Record<string, string>}) => Promise<{ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string>}>;

/** Refreshes one store's mp_reviews doc. Returns the error text ('' when fine). */
export async function refreshStoreReviews(storeId: string, placeId: string, s: SalesSettings, people: Person[], now: number,
  key = process.env.GOOGLE_PLACES_KEY || '', fetcher: Fetcher = fetch as unknown as Fetcher): Promise<string> {
  const ref = db().collection(C.reviews).doc(storeId);
  if (!key) {
    await ref.set({storeId, placeId, error: NO_KEY_ERROR, updatedAt: now}, {merge: true});
    return NO_KEY_ERROR;
  }
  let place: ParsedPlace;
  try {
    const res = await fetcher(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {'X-Goog-Api-Key': key, 'X-Goog-FieldMask': PLACES_FIELDS},
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let msg = `Google said ${res.status}`;
      try {
        msg = String(JSON.parse(body)?.error?.message || msg);
      } catch {
        // keep the status text
      }
      throw new Error(msg);
    }
    place = parsePlaceDetails(await res.json());
  } catch (e) {
    const error = `Could not load Google reviews: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
    await ref.set({storeId, placeId, error, updatedAt: now}, {merge: true});
    return error;
  }

  const prev = (await ref.get()).data() || {};
  const firstRun = !Array.isArray(prev.seenIds) || prev.placeId !== placeId;
  const fresh = firstRun ? [] : newReviews(place.reviews, prev.seenIds, Number(prev.lastSeenTime) || 0);
  const history = updateHistory(prev.placeId === placeId ? prev.history : [], nyDateKey(now), place.count, place.rating);
  const seenIds = [...new Set([...place.reviews.map((r) => r.id), ...(firstRun ? [] : prev.seenIds as string[])])].slice(0, 200);
  const lastSeenTime = Math.max(Number(firstRun ? 0 : prev.lastSeenTime) || 0, ...place.reviews.map((r) => r.time));

  await ref.set(clean({
    storeId, placeId, name: place.name, rating: place.rating, count: place.count, googleMapsUri: place.mapsUri,
    latest: place.reviews.map((r) => clean({author: r.author, rating: r.rating, text: r.text, time: r.time, uri: r.uri})),
    history, countWeekAgo: countDaysAgo(history, now, 7), countMonthAgo: countDaysAgo(history, now, 30),
    seenIds, lastSeenTime, updatedAt: now, error: admin.firestore.FieldValue.delete(),
  }), {merge: true});

  const city = storeCity(storeId) || storeId;
  for (const r of fresh) {
    if (r.rating > s.reviews.alertAtOrBelow) continue;
    const quote = r.text ? `: '${r.text.length > 140 ? `${r.text.slice(0, 137)}…` : r.text}'` : '';
    const link = r.uri || place.mapsUri;
    const text = `New ${stars(r.rating)} Google review for ${city}${quote} — reply fast. ${link}`.trim();
    const idPart = r.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(-80);
    for (const m of managersFor(people, storeId)) {
      await notify(m.uid, 'Google reviews', text, {source: 'mp_reviews', url: link, storeId}, `rev_${m.uid}_${idPart}`);
    }
  }
  return '';
}

/** Refreshes every store that has a Place ID. */
export async function refreshAllReviews(now: number, s: SalesSettings, key = process.env.GOOGLE_PLACES_KEY || '') {
  const entries = Object.entries(s.reviews.placeIds || {}).filter(([id, p]) => id !== 'T0' && typeof p === 'string' && p.trim());
  const people = entries.length && key ? await loadPeople() : [];
  const results: Array<{storeId: string; error: string}> = [];
  for (const [storeId, placeId] of entries) {
    const error = await refreshStoreReviews(storeId, placeId.trim(), s, people, now, key)
      .catch((e) => (e instanceof Error ? e.message : String(e)));
    results.push({storeId, error});
    if (error === NO_KEY_ERROR) {
      // Mark the rest too (so the settings page shows the key status) and stop.
      for (const [sid, pid] of entries) {
        if (sid !== storeId) await db().collection(C.reviews).doc(sid).set({storeId: sid, placeId: pid, error: NO_KEY_ERROR, updatedAt: now}, {merge: true});
      }
      break;
    }
  }
  return results;
}

/** Once a day: refresh Google ratings/reviews per store, alert on low-star reviews. */
export async function marketingDaily(now: number, s: SalesSettings): Promise<void> {
  if (!s.reviews.enabled) return;
  const results = await refreshAllReviews(now, s);
  const bad = results.filter((r) => r.error);
  if (bad.length) logger.warn('marketingDaily: review refresh problems', bad);
}

/** "Refresh now" (managers): refresh every store's Google reviews right away. */
export const mpReviewsRefresh = onCall({timeoutSeconds: 120}, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const me = (await db().collection(C.users).doc(req.auth.uid).get()).data() || {};
  if (!isManagerRole(String(me.role || ''))) throw new HttpsError('permission-denied', 'Only managers can refresh reviews');
  const s = await loadSalesSettings(true);
  if (!Object.values(s.reviews.placeIds || {}).some((p) => String(p || '').trim())) {
    return {stores: 0, errors: [], message: 'No Place IDs yet — add them in Sell more settings → Reviews & referrals.'};
  }
  const results = await refreshAllReviews(Date.now(), s);
  const errors = results.filter((r) => r.error);
  return {stores: results.length, errors, message: errors.length ? errors[0].error : `Updated ${results.length} store${results.length === 1 ? '' : 's'}.`};
});

// ===========================================================================
// 17. Referral program
// ===========================================================================

/** "maria" + 4 random characters. */
export function referralCodeFor(name: unknown): string {
  const first = String(name || '').trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 12) || 'friend';
  return `${first}${code(4)}`;
}

export const referralLink = (c: string) => `${PUBLIC_ORIGIN}/r/${c}`;

/** Creates a referral code with zero counters (tries a few random endings). */
async function createReferralDoc(data: {name: string; phone: string; leadId?: string; customerId?: string; storeId?: string; createdBy?: string}, now: number): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const c = referralCodeFor(data.name);
    const ref = db().collection(C.referrals).doc(c);
    try {
      await ref.create(clean({
        code: c, name: data.name || 'Customer', phone: e164(data.phone) || String(data.phone || ''), leadId: data.leadId,
        customerId: data.customerId, storeId: data.storeId, createdBy: data.createdBy || 'system',
        leads: 0, sales: 0, rewardsOwed: 0, rewardsPaid: 0, createdAt: now,
      }));
      return c;
    } catch (e) {
      if ((e as {code?: number}).code !== 6) throw e; // 6 = ALREADY_EXISTS → try another ending
    }
  }
  throw new Error('Could not create a referral code');
}

/** The buyer's existing code (same lead, customer or phone), else ''. */
async function findReferralFor(leadId: string, lead: Json): Promise<string> {
  const col = db().collection(C.referrals);
  const tries: Array<[string, string]> = [['leadId', leadId]];
  if (lead.customerId) tries.push(['customerId', String(lead.customerId)]);
  const phone = e164(lead.phone);
  if (phone) tries.push(['phone', phone]);
  for (const [field, value] of tries) {
    const snap = await col.where(field, '==', value).limit(1).get();
    if (!snap.empty) return snap.docs[0].id;
  }
  return '';
}

/** Lead's store: locationId, else the owner's store. */
const leadStore = (lead: Json, people: Person[]) =>
  String(lead.locationId || people.find((p) => p.uid === lead.ownerUid)?.location || '');

/** Credits a new lead to its referral code once (leads + 1, note "Referred by …"). */
export async function creditReferralLead(leadId: string, referralCode: string, now = Date.now()): Promise<boolean> {
  const c = String(referralCode || '').toLowerCase().trim();
  if (!c) return false;
  const leadRef = db().collection(C.leads).doc(leadId);
  const refRef = db().collection(C.referrals).doc(c);
  return db().runTransaction(async (tx) => {
    const [leadSnap, refSnap] = await Promise.all([tx.get(leadRef), tx.get(refRef)]);
    if (!leadSnap.exists || !refSnap.exists) return false;
    const lead = leadSnap.data() || {};
    if (lead.referralCountedAt) return false;
    const ref = refSnap.data() || {};
    if (ref.leadId && ref.leadId === leadId) return false; // can't refer yourself
    const note = `Referred by ${ref.name || 'a customer'}`;
    const notes = String(lead.notes || '');
    tx.update(refRef, {leads: admin.firestore.FieldValue.increment(1), lastUsedAt: now});
    tx.update(leadRef, {
      referralCountedAt: now, referralCode: c,
      notes: notes.includes(note) ? notes : (notes ? `${notes}\n${note}` : note),
    });
    return true;
  });
}

/** New lead: credit a referral code (lead.referralCode). */
export async function onNewLeadMarketing(id: string, lead: Json, s: SalesSettings): Promise<void> {
  if (!s.referral.enabled || !lead.referralCode) return;
  await creditReferralLead(id, String(lead.referralCode));
}

/** Pure: what a sale means for the referral that brought it (null = nothing to credit). */
export function rewardFor(ref: Json | undefined, buyerLeadId: string, alreadyCredited: boolean, rewardAmount: number) {
  if (!ref || alreadyCredited || (ref.leadId && ref.leadId === buyerLeadId)) return null;
  const amount = Math.max(0, Number(rewardAmount) || 0);
  return {sales: (Number(ref.sales) || 0) + 1, rewardsOwed: (Number(ref.rewardsOwed) || 0) + amount, amount};
}

/** Lead changed: sold with a referral → reward owed; sold → create the buyer's own referral code. */
export async function onLeadUpdatedMarketing(id: string, before: Json, after: Json, s: SalesSettings): Promise<void> {
  if (!s.referral.enabled) return;
  if (before.status === 'sold' || after.status !== 'sold') return;
  const now = Date.now();
  const people = await loadPeople();
  const storeId = leadStore(after, people);
  const leadRef = db().collection(C.leads).doc(id);

  // 1) The buyer's own referral code + a task for the owner to send it.
  let myCode = String(after.myReferralCode || '');
  if (!myCode) {
    myCode = await findReferralFor(id, after) ||
      await createReferralDoc({name: String(after.name || ''), phone: String(after.phone || ''), leadId: id, customerId: after.customerId, storeId}, now);
    await leadRef.set({myReferralCode: myCode}, {merge: true});
  }
  const owner = String(after.ownerUid || '') || managersFor(people, storeId)[0]?.uid || '';
  if (owner) {
    const soldAt = Number(after.soldAt) || now;
    const taskRef = db().collection(C.tasks).doc(`ref_${id}`);
    if (!(await taskRef.get()).exists) {
      const name = String(after.name || 'the buyer');
      await taskRef.set(clean({
        ownerUid: owner, leadId: id, customerId: after.customerId, kind: 'other', title: `Send ${name} their referral link`,
        suggestedText: fill(s.referral.template, {
          first: firstName(after.name), store: storeCity(storeId) || '', reward: s.referral.rewardAmount, link: referralLink(myCode),
        }),
        channel: 'sms', phone: e164(after.phone) || undefined, dueAt: soldAt + DAY_MS, status: 'open', createdAt: now,
      }));
    }
  }

  // 2) This sale came from a referral → reward owed to the referrer.
  const rc = String(after.referralCode || '').toLowerCase().trim();
  if (!rc) return;
  const refRef = db().collection(C.referrals).doc(rc);
  const credited = await db().runTransaction(async (tx) => {
    const [leadSnap, refSnap] = await Promise.all([tx.get(leadRef), tx.get(refRef)]);
    const r = rewardFor(refSnap.exists ? refSnap.data() : undefined, id, !!leadSnap.get('referralRewardAt'), s.referral.rewardAmount);
    if (!r) return null;
    tx.update(refRef, {sales: r.sales, rewardsOwed: r.rewardsOwed, lastSaleAt: now});
    tx.set(leadRef, {referralRewardAt: now, referralRewardAmount: r.amount}, {merge: true});
    return {amount: r.amount, referrer: String(refSnap.get('name') || 'a customer')};
  });
  if (!credited) return;
  const text = `Referral reward owed: $${credited.amount} to ${credited.referrer} (referred ${after.name || 'a buyer'}). See Referrals to mark it paid.`;
  for (const m of managersFor(people, storeId)) {
    await notify(m.uid, 'Referrals', text, {source: 'mp_referrals', url: `${PUBLIC_ORIGIN}/mp/referrals`}, `refreward_${m.uid}_${id}`);
  }
}

// ---- Public pages: /r/:code ------------------------------------------------

const getReferral: PublicHandler = async (req) => {
  const c = String(req.rest[0] || req.query.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const s = await loadSalesSettings();
  if (!c || !s.referral.enabled) throw new PublicError(404, 'This referral link is not active.');
  const snap = await db().collection(C.referrals).doc(c).get();
  if (!snap.exists) throw new PublicError(404, 'This referral link is not active.');
  const storeId = String(snap.get('storeId') || '');
  const store = storeOf(storeId);
  return {body: {code: c, firstName: firstName(snap.get('name')), storeId, storeName: store?.cityState || '', phone: store?.phone || ''}, cacheSeconds: 60};
};

/** Phone formats a lead may have been saved with. */
const phoneVariants = (phone: string) => {
  const d = phone.slice(2);
  return [...new Set([phone, d, `1${d}`, prettyPhone(phone), `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`, `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`])];
};

const submitReferral: PublicHandler = async (req) => {
  const b = req.body || {};
  if (b.website) return {body: {ok: true}}; // honeypot
  const c = String(b.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const name = String(b.name || '').trim().slice(0, 80);
  const phone = e164(b.phone);
  const email = String(b.email || '').trim().slice(0, 120);
  const interest = String(b.interest || '').trim().slice(0, 600);
  if (!name) throw new PublicError(400, 'Please enter your name.');
  if (!phone) throw new PublicError(400, 'Please enter a 10-digit phone number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PublicError(400, 'That email doesn\'t look right.');
  if (b.consent !== true) throw new PublicError(400, 'Please tick the box so we can contact you.');
  const s = await loadSalesSettings();
  const refSnap = c ? await db().collection(C.referrals).doc(c).get() : null;
  if (!refSnap?.exists || !s.referral.enabled) throw new PublicError(404, 'This referral link is not active.');
  const ref = refSnap.data() || {};
  const storeId = storeOf(b.storeId) && b.storeId !== 'T0' ? String(b.storeId) : String(ref.storeId || '');
  const people = await loadPeople();
  const now = Date.now();

  // Owner: the salesperson who sold to the referrer, else the store's manager.
  let ownerUid = '';
  if (ref.leadId) {
    const sold = await db().collection(C.leads).doc(String(ref.leadId)).get();
    const o = String(sold.get('ownerUid') || '');
    if (o && people.some((p) => p.uid === o)) ownerUid = o;
  }
  if (!ownerUid) ownerUid = managersFor(people, storeId)[0]?.uid || '';

  const note = [interest && `Looking for: ${interest}`, `Referred by ${ref.name || 'a customer'}`].filter(Boolean).join('\n');
  // Same phone with an open lead → add to it instead of making a duplicate.
  const existing = (await db().collection(C.leads).where('phone', 'in', phoneVariants(phone)).get()).docs
    .filter((d) => d.get('status') === 'new' || d.get('status') === 'talking')
    .sort((x, y) => Number(y.get('createdAt') || 0) - Number(x.get('createdAt') || 0))[0];
  if (existing) {
    const notes = String(existing.get('notes') || '');
    await existing.ref.set(clean({
      notes: notes ? `${notes}\n${note}` : note, referralCode: existing.get('referralCode') || c,
      email: existing.get('email') || email || undefined, smsConsent: true, updatedAt: now,
    }), {merge: true});
    if (!existing.get('referralCode')) await creditReferralLead(existing.id, c, now);
    const o = String(existing.get('ownerUid') || ownerUid);
    if (o) await notify(o, 'Referrals', `${name} came back through ${ref.name || 'a customer'}'s referral link. Call or text them: ${prettyPhone(phone)}`, {source: 'mp_referrals', leadId: existing.id});
    return {body: {ok: true}};
  }
  await db().collection(C.leads).add(clean({
    name, phone, email, channel: 'website', source: 'referral', status: 'new', ownerUid, locationId: storeId || undefined,
    referralCode: c, notes: interest ? `Looking for: ${interest}` : '', smsConsent: true, createdAt: now, updatedAt: now,
  }));
  return {body: {ok: true}};
};

/** area → action → handler. Area: referral. */
export const marketingPublic: Record<string, Record<string, PublicHandler>> = {
  referral: {get: getReferral, submit: submitReferral},
};
