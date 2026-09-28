// Growth release — Sales & marketing (CRM) server jobs.
//   mpCrmReminders : every 30 minutes — lead follow-up reminders + daily relist reminders (IoT notifications)
//   mpWeeklyDigest : Mondays 08:00 New York — last week's team stats → notifications + mp_meta/digest_<weekKey>
import * as logger from 'firebase-functions/logger';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

const USERS = 'mp_users';
const LEADS = 'mp_leads';
const CARTS = 'mp_carts';
const ACCOUNTS = 'mp_accounts';
const EVENTS = 'mp_events';
const CLICKS = 'mp_clicks';
const META = 'mp_meta';
const SETTINGS = 'mp_settings';
const TZ = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Relist reminders go out once a day, from this New York hour on. */
const RELIST_HOUR = 9;
/** More relist reminders than this for one person are rolled into a single summary. */
const RELIST_MAX_SINGLE = 3;

type Json = Record<string, any>;

const db = () => admin.firestore();
const isManagerRole = (role: unknown) => role === 'admin' || role === 'manager';

/** Year/month/day/hour/minute/weekday of a timestamp in New York time. */
function nyParts(ts: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date(ts));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
    hour: Number(get('hour')) % 24, minute: Number(get('minute')), second: Number(get('second')),
    weekday: get('weekday'),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const nyDateKey = (ts: number) => {
  const p = nyParts(ts);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

/** ISO week key (e.g. 2026-W40) of a New York calendar date. */
function isoWeekKey(ts: number): string {
  const p = nyParts(ts);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

/** Best-effort "Make Model Color" from an mp_carts payload (DMS or manual shape). */
function cartTitleOf(data: Json): string {
  let p: Json = {};
  try {
    p = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload || {};
  } catch {
    p = {};
  }
  const src: Json = p.cart && typeof p.cart === 'object' ? p.cart : p;
  const type: Json = src.cartType || {};
  const attrs: Json = src.cartAttributes || {};
  const title = [type.make || src.make, type.model || src.model, attrs.cartColor || src.color]
    .filter((s) => typeof s === 'string' && s.trim()).join(' ');
  return title || `Cart ${data.serial || data.dmsId || ''}`.trim();
}

function notification(targetUserId: string, sourceDeviceName: string, text: string, extra: Json = {}): Json {
  return {
    targetUserId,
    sourceDeviceName,
    text,
    isHandled: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  };
}

/** Commits writes in chunks below Firestore's 500-op batch limit. */
async function commitAll(ops: Array<(b: admin.firestore.WriteBatch) => void>) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db().batch();
    for (const op of ops.slice(i, i + 400)) op(batch);
    await batch.commit();
  }
}

async function relistAfterDays(): Promise<number> {
  const snap = await db().collection(SETTINGS).doc('general').get();
  const n = Number(snap.get('relistAfterDays'));
  return n > 0 ? n : 7;
}

// ---------------------------------------------------------------------------
// Follow-up + relist reminders
// ---------------------------------------------------------------------------

/** Leads whose follow-up time has come → one notification per follow-up time to the owner. */
async function followUpReminders(now: number): Promise<number> {
  const due = await db().collection(LEADS).where('followUpAt', '<=', now).get();
  const ops: Array<(b: admin.firestore.WriteBatch) => void> = [];
  for (const d of due.docs) {
    const lead = d.data() as Json;
    if (!['new', 'talking'].includes(lead.status)) continue;
    if (!lead.ownerUid || !lead.followUpAt) continue;
    if (lead.followUpRemindedAt === lead.followUpAt) continue; // already reminded for this time
    const text = `Follow up: ${lead.name || 'a lead'}${lead.cartTitle ? ` about ${lead.cartTitle}` : ''}`;
    ops.push((b) => b.set(db().collection('notifications').doc(),
      notification(lead.ownerUid, 'MP Leads', text, {source: 'mp_followup', leadId: d.id})));
    ops.push((b) => b.update(d.ref, {followUpRemindedAt: lead.followUpAt}));
  }
  await commitAll(ops);
  return ops.length / 2;
}

/**
 * Once a day: postings older than relistAfterDays → "Time to refresh <cart> on <account>" to the poster.
 * A posting is reminded once, then again every relistAfterDays days until it is re-posted (new ts) or sold.
 */
async function relistReminders(now: number): Promise<number> {
  const metaRef = db().collection(META).doc('crm_reminders');
  const today = nyDateKey(now);
  if (nyParts(now).hour < RELIST_HOUR) return 0;
  if ((await metaRef.get()).get('relistDay') === today) return 0;
  await metaRef.set({relistDay: today, relistRunAt: now}, {merge: true});

  const days = await relistAfterDays();
  const cutoff = now - days * DAY_MS;
  const [carts, accounts, users] = await Promise.all([
    db().collection(CARTS).get(),
    db().collection(ACCOUNTS).get(),
    db().collection(USERS).get(),
  ]);
  const accountName = new Map(accounts.docs.map((a) => [a.id, String(a.get('name') || a.id)]));
  const members = new Set(users.docs.map((u) => u.id));

  const perUser = new Map<string, string[]>();
  const cartUpdates: Array<(b: admin.firestore.WriteBatch) => void> = [];
  for (const c of carts.docs) {
    const data = c.data() as Json;
    if (data.soldLocally) continue;
    const posted: Json = data.postedAccounts || {};
    const reminded: Json = data.relistRemindedAt || {};
    const update: Json = {};
    let title = '';
    for (const [accountId, entry] of Object.entries(posted)) {
      const ts = Number(entry?.ts) || 0;
      const by = String(entry?.by || '');
      if (!ts || ts > cutoff || !members.has(by)) continue;
      const last = Number(reminded[accountId]) || 0;
      if (last > ts && now - last < days * DAY_MS) continue;
      title = title || cartTitleOf(data);
      const list = perUser.get(by) || [];
      list.push(`${title} on ${accountName.get(accountId) || 'an account'}`);
      perUser.set(by, list);
      update[`relistRemindedAt.${accountId}`] = now;
    }
    if (Object.keys(update).length) cartUpdates.push((b) => b.update(c.ref, update));
  }

  const notes: Array<(b: admin.firestore.WriteBatch) => void> = [];
  for (const [uid, items] of perUser) {
    if (items.length <= RELIST_MAX_SINGLE) {
      for (const item of items) {
        notes.push((b) => b.set(db().collection('notifications').doc(),
          notification(uid, 'MP Relist', `Time to refresh ${item}`, {source: 'mp_relist'})));
      }
    } else {
      const text = `Time to refresh ${items.length} listings: ${items.slice(0, 3).join('; ')}… ` +
        'See MP Assistant → Insights → Relist.';
      notes.push((b) => b.set(db().collection('notifications').doc(),
        notification(uid, 'MP Relist', text, {source: 'mp_relist'})));
    }
  }
  await commitAll([...cartUpdates, ...notes]);
  return notes.length;
}

/** Every 30 minutes: lead follow-up reminders; once a day (after 9am NY) relist reminders. */
export const mpCrmReminders = onSchedule({schedule: 'every 30 minutes', timeZone: TZ}, async () => {
  const now = Date.now();
  try {
    const n = await followUpReminders(now);
    if (n) logger.info('mpCrmReminders: follow-ups sent', n);
  } catch (err) {
    logger.error('mpCrmReminders: follow-ups failed', err);
  }
  try {
    const n = await relistReminders(now);
    if (n) logger.info('mpCrmReminders: relist notifications sent', n);
  } catch (err) {
    logger.error('mpCrmReminders: relist failed', err);
  }
});

// ---------------------------------------------------------------------------
// Weekly digest
// ---------------------------------------------------------------------------

interface PersonStats {
  posts: number;
  leads: number;
  sales: number;
  clicks: number;
}

const emptyPerson = (): PersonStats => ({posts: 0, leads: 0, sales: 0, clicks: 0});

function topKey(m: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const e of m) if (!best || e[1] > best[1]) best = e;
  return best;
}

const inc = (m: Map<string, number>, k: string | undefined, by = 1) => {
  if (k) m.set(k, (m.get(k) || 0) + by);
};

/** Mondays 08:00 New York: last week's stats → managers (team) + active members (personal). */
export const mpWeeklyDigest = onSchedule({schedule: 'every monday 08:00', timeZone: TZ}, async () => {
  const now = Date.now();
  const p = nyParts(now);
  // Midnight (New York) today, then back 7 days. Off by an hour only on DST-change weekends.
  const end = now - ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 - (now % 1000);
  const start = end - 7 * DAY_MS;
  const weekKey = isoWeekKey(start + DAY_MS);

  const [events, created, sold, clicks, users] = await Promise.all([
    db().collection(EVENTS).where('ts', '>=', start).where('ts', '<', end).get(),
    db().collection(LEADS).where('createdAt', '>=', start).where('createdAt', '<', end).get(),
    db().collection(LEADS).where('soldAt', '>=', start).where('soldAt', '<', end).get(),
    db().collection(CLICKS).where('ts', '>=', start).where('ts', '<', end).get(),
    db().collection(USERS).get(),
  ]);

  const people = new Map<string, PersonStats>();
  const person = (uid: string) => {
    if (!people.has(uid)) people.set(uid, emptyPerson());
    return people.get(uid)!;
  };
  const cartScore = new Map<string, number>();
  const cartTitles = new Map<string, string>();
  const phonePosts = new Map<string, number>();
  let posts = 0;
  let revenue = 0;

  for (const e of events.docs) {
    const ev = e.data() as Json;
    if (ev.type !== 'post_marked') continue;
    posts++;
    if (ev.userId) person(ev.userId).posts++;
    if (ev.deviceId && ev.deviceId !== 'web') inc(phonePosts, ev.deviceId);
  }
  for (const l of created.docs) {
    const lead = l.data() as Json;
    if (lead.ownerUid) person(lead.ownerUid).leads++;
    inc(cartScore, lead.cartId);
    if (lead.cartId && lead.cartTitle) cartTitles.set(lead.cartId, lead.cartTitle);
  }
  for (const l of sold.docs) {
    const lead = l.data() as Json;
    if (lead.status !== 'sold') continue;
    if (lead.ownerUid) person(lead.ownerUid).sales++;
    revenue += Number(lead.soldPrice) || 0;
  }
  for (const c of clicks.docs) {
    const click = c.data() as Json;
    if (click.userId) person(click.userId).clicks++;
    inc(cartScore, click.cartId);
  }
  const salesCount = sold.docs.filter((l) => l.get('status') === 'sold').length;

  const names = new Map(users.docs.map((u) => [u.id, String(u.get('name') || u.get('email') || 'Someone')]));
  const top = topKey(cartScore);
  let topCart: Json | null = null;
  if (top) {
    let title = cartTitles.get(top[0]) || '';
    if (!title) {
      const snap = await db().collection(CARTS).doc(top[0]).get();
      title = snap.exists ? cartTitleOf(snap.data() as Json) : top[0];
    }
    topCart = {cartId: top[0], title, score: top[1]};
  }
  const phone = topKey(phonePosts);
  let bestPhone: Json | null = null;
  if (phone) {
    const snap = await db().collection('devices').doc(phone[0]).get();
    bestPhone = {deviceId: phone[0], name: String(snap.get('deviceName') || phone[0]), posts: phone[1]};
  }
  const score = (s: PersonStats) => s.posts + s.leads * 3 + s.sales * 10;
  let bestPerson: Json | null = null;
  for (const [uid, s] of people) {
    if (!bestPerson || score(s) > bestPerson.score) bestPerson = {uid, name: names.get(uid) || uid, score: score(s), ...s};
  }

  const stats = {
    weekKey, start, end, createdAt: now,
    posts, leads: created.size, sales: salesCount, revenue, clicks: clicks.size,
    topCart, bestPhone, bestPerson,
    people: Object.fromEntries([...people].map(([uid, s]) => [uid, {...s, name: names.get(uid) || uid}])),
  };
  await db().collection(META).doc(`digest_${weekKey}`).set(stats);

  const teamText = `Last week: ${posts} posts, ${created.size} leads, ${salesCount} sales, ${clicks.size} link clicks.` +
    (topCart ? ` Top cart: ${topCart.title}.` : '') +
    (bestPhone ? ` Busiest phone: ${bestPhone.name}.` : '') +
    (bestPerson ? ` Top performer: ${bestPerson.name}.` : '');

  const ops: Array<(b: admin.firestore.WriteBatch) => void> = [];
  for (const u of users.docs) {
    const extra = {source: 'mp_digest', weekKey};
    if (isManagerRole(u.get('role'))) {
      ops.push((b) => b.set(db().collection('notifications').doc(), notification(u.id, 'MP Weekly digest', teamText, extra)));
      continue;
    }
    const s = people.get(u.id);
    if (!s || !(s.posts || s.leads || s.sales || s.clicks)) continue;
    const text = `Your week: ${s.posts} posts, ${s.leads} leads, ${s.sales} sales, ${s.clicks} link clicks. Keep it up!`;
    ops.push((b) => b.set(db().collection('notifications').doc(), notification(u.id, 'MP Weekly digest', text, extra)));
  }
  await commitAll(ops);
  logger.info('mpWeeklyDigest done', weekKey, {posts, leads: created.size, sales: salesCount, notifications: ops.length});
});
