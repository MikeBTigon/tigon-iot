// Track 1 — Speed to lead (ideas 1, 3, 4, 19): response timer + alerts, Facebook messages → leads,
// round-robin assignment with claim window, daily "who to call today" list.
// Signatures are called from hooks.ts / echoHooks.ts — keep them.
//
// Lead fields written here (LeadSalesFields): locationId, source, speedAlerted, assignedAt, claimDeadline, claimedAt,
// assignHistory, fbAccountId, fbSender, fbMessages. firstResponseAt/responseMinutes are set by the app (call/text/email
// tap, claim) and by outbox.markLeadTexted (texts a person sent).
import * as admin from 'firebase-admin';
import {createHash} from 'crypto';
import type {SalesSettings} from './settings';
import {C, MIN_MS, cartSummary, clean, commitAll, db, isQuietHour, loadPeople, managersFor, notify, nyDateKey, nyTime} from './util';
import type {Json, Person} from './util';

const FV = admin.firestore.FieldValue;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Leads that arrive on their own (website forms, Facebook messages, missed calls, public pages). */
export const AUTO_SOURCES = ['website', 'facebook_message', 'missed_call', 'quote', 'booking', 'trade_in', 'prequal', 'referral'];
export const isAutoLead = (id: string, lead: Json) => AUTO_SOURCES.includes(String(lead.source || '')) || id.startsWith('wh_');

/** A person answered the lead (call/text/email tap, a text they sent, or claiming it). */
export const isAnswered = (lead: Json) => !!(Number(lead.firstResponseAt) || Number(lead.lastContactAt) || Number(lead.claimedAt));

const CHANNEL_LABEL: Json = {
  facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', sms: 'Text', phone: 'Phone', email: 'Email',
  'walk-in': 'Walk-in', website: 'Website', dba_website: 'Website', other: 'Other',
};
const SOURCE_LABEL: Json = {
  facebook_message: 'Facebook message', missed_call: 'Missed call', quote: 'Quote', booking: 'Booking',
  trade_in: 'Trade-in', prequal: 'Pre-qualification', referral: 'Referral', website: 'Website',
};
export const leadLabel = (lead: Json) => {
  const who = String(lead.name || lead.phone || lead.email || 'New customer');
  const cart = lead.cartTitle ? ` — ${lead.cartTitle}` : '';
  const from = SOURCE_LABEL[String(lead.source || '')] || CHANNEL_LABEL[String(lead.channel || '')] || '';
  return `${who}${cart}${from ? ` (${from})` : ''}`;
};

/** "12 min", "3 h", "2 days". */
export function minutesLabel(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} days`;
}

/**
 * Speed alert marks (minutes) that are due for a lead now. Empty when it was answered, isn't new, is older than the
 * last mark + 60 minutes (stale — the daily list covers it), or every due mark was already sent.
 */
export function dueSpeedMarks(lead: Json, now: number, marks: number[]): number[] {
  if (lead.status && lead.status !== 'new') return [];
  if (isAnswered(lead)) return [];
  const created = Number(lead.createdAt) || 0;
  if (!created) return [];
  const sorted = [...new Set(marks.map(Number).filter((m) => m > 0))].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const age = (now - created) / MIN_MS;
  if (age > sorted[sorted.length - 1] + 60) return [];
  const sent = new Set((Array.isArray(lead.speedAlerted) ? lead.speedAlerted : []).map(Number));
  return sorted.filter((m) => age >= m && !sent.has(m));
}

/**
 * Next person in the rotation: the first uid (sorted) after `last`, wrapping around, skipping `exclude`.
 * null when everyone is excluded.
 */
export function pickNext(candidates: string[], last: string, exclude: Set<string>): string | null {
  const sorted = [...new Set(candidates)].filter(Boolean).sort();
  if (!sorted.length) return null;
  let start = last ? sorted.findIndex((u) => u > last) : 0;
  if (start < 0) start = 0;
  for (let i = 0; i < sorted.length; i++) {
    const u = sorted[(start + i) % sorted.length];
    if (!exclude.has(u)) return u;
  }
  return null;
}

/** People at a store who can take a lead now. `offline` = nobody was online, so everyone at the store is offered. */
export function storeCandidates(people: Person[], storeId: string, online: Set<string>, onlineOnly: boolean): {uids: string[]; offline: boolean} {
  const at = people.filter((p) => p.location === storeId).map((p) => p.uid).sort();
  if (!onlineOnly) return {uids: at, offline: false};
  const on = at.filter((u) => online.has(u));
  return on.length ? {uids: on, offline: false} : {uids: at, offline: true};
}

// ---- Facebook notifications ----

export interface FbParsed {
  /** Buyer's name. */
  sender: string;
  /** Text that may name the listing (thread title / "about …" part). */
  hint: string;
  /** What the buyer wrote (may be empty). */
  message: string;
  /** The wording itself says it's about a listing (Marketplace). */
  aboutListing: boolean;
}

const GENERIC_TITLE = /^(facebook( lite)?|messenger|marketplace|meta business suite|business suite|pages manager|chats?|messages?|new messages?|\d+ new messages?|\d+ messages? from \d+ chats?|notification|you)$/i;
const LISTING_WORDS = /(marketplace|your listing|your item|still available|is this available|is it available|interested in your|asked about your|message about|messages about|about your)/i;
const SEPARATORS = /\s+[·•|–—-]\s+/;
const looksLikeListing = (s: string) => /\d/.test(s) || /(golf|cart|evolution|icon|epic|denago|tara|club car|ez-?go|yamaha|teko|kandi|gem|bintelli|lifted|seater|passenger|\$)/i.test(s);
const looksLikeName = (s: string) => /^[\p{L}][\p{L}'.-]*(\s+[\p{L}][\p{L}'.-]*){0,3}$/u.test(s.trim()) && s.trim().length <= 40;

const BUYER_VERBS = '(?:sent you a message|sent a message|sent you a photo|sent a photo|sent an attachment|sent a voice message|sent a link|messaged you|replied to your message|replied to you|wrote|is interested in your listing|is interested in your item|is interested in|asked about your listing|asked about your item|asked about|has a question about)';

/** Who wrote, about what, from a forwarded Facebook / Messenger notification. null when there's no person to reply to. */
export function parseFbNotification(title: string, text: string): FbParsed | null {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  const x = String(text || '').replace(/\s+/g, ' ').trim();
  const body = `${t} ${x}`.trim();
  const aboutListing = LISTING_WORDS.test(body);
  const tidy = (s: string) => s.replace(/^[\s:"'“”‘’-]+|[\s:"'“”‘’.!-]+$/g, '').trim();

  // "Jane Doe sent you a message about 2022 EVOLUTION D5: Is this available?" (Facebook app, title often "Facebook")
  const genericTitle = !t || GENERIC_TITLE.test(t);
  // The sentence is the text (generic title), the title itself, or title + text when the text starts with the verb.
  const sentences = genericTitle ? [x] : [t, ...(new RegExp(`^${BUYER_VERBS}`, 'i').test(x) ? [body] : [])];
  for (const src of sentences) {
    const m = src.match(new RegExp(`^(.{2,60}?)\\s+${BUYER_VERBS}\\b\\s*(?:about|for|on|regarding)?\\s*(?:your listing|your item|your)?\\s*(.*)$`, 'i'));
    if (m && !GENERIC_TITLE.test(tidy(m[1]))) {
      const rest = m[2] || '';
      const split = rest.match(/^["“]?([^"”:]{3,120})["”]?\s*[:\-–]\s*(.*)$/);
      return {
        sender: tidy(m[1]), hint: tidy(split ? split[1] : rest), message: tidy(split ? split[2] : rest),
        aboutListing: aboutListing || /interested|asked about|question about/i.test(src),
      };
    }
  }
  // "New message from Jane Doe about 2022 EVOLUTION D5" / "Message about your listing 2022 … from Jane Doe"
  const scan = genericTitle ? x : t;
  const from = scan.match(/(?:new )?messages? from (.{2,60}?)(?: about (?:your listing |your item )?(.+))?$/i);
  if (from && !GENERIC_TITLE.test(tidy(from[1]))) {
    return {sender: tidy(from[1]), hint: tidy(from[2] || ''), message: tidy(from[2] ? '' : x), aboutListing: true};
  }
  const about = scan.match(/messages? about (?:your listing |your item )?["“]?(.+?)["”]?\s+from\s+(.{2,60})$/i);
  if (about) return {sender: tidy(about[2]), hint: tidy(about[1]), message: '', aboutListing: true};

  // Messenger: title is the thread — "Jane Doe · 2022 Evolution D5" or "2022 Evolution D5 · Jane Doe" (Marketplace)
  if (t && !GENERIC_TITLE.test(t)) {
    const parts = t.split(SEPARATORS).map(tidy).filter(Boolean);
    if (parts.length >= 2) {
      const listingIdx = parts.findIndex(looksLikeListing);
      const nameIdx = parts.findIndex((p, i) => i !== listingIdx && looksLikeName(p));
      const sIdx = nameIdx >= 0 ? nameIdx : listingIdx === 0 ? 1 : 0;
      const hint = parts.filter((_p, i) => i !== sIdx).join(' ');
      let message = x;
      let sender = parts[sIdx];
      // Group-style thread text "Jane: Is this still available?"
      const said = x.match(/^([^:]{2,40}):\s+(.+)$/);
      if (said && looksLikeName(said[1]) && !/^you$/i.test(said[1])) {
        sender = nameIdx >= 0 ? sender : tidy(said[1]);
        message = said[2];
      }
      return {sender, hint, message: tidy(message), aboutListing: true};
    }
    // Plain chat: title = sender, text = message.
    return {sender: t, hint: '', message: x, aboutListing};
  }
  // Generic title ("Messenger", "Facebook"): "Jane Doe: Is this still available?"
  const said = x.match(/^([^:]{2,40}):\s+(.+)$/);
  if (said && !GENERIC_TITLE.test(tidy(said[1]))) return {sender: tidy(said[1]), hint: '', message: tidy(said[2]), aboutListing};
  return null;
}

export interface CartLite {
  id: string;
  title: string;
  make: string;
  model: string;
  year: string;
  locationId: string;
  /** Account (one of the phone's) that posted it, and when. */
  accountId: string;
  postedTs: number;
}

const norm = (s: string) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
const squash = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** How well a notification's text names this cart (0 = not at all). */
export function scoreCart(cart: CartLite, text: string): number {
  const hay = norm(text);
  const haySquash = squash(text);
  const has = (phrase: string) => {
    const n = norm(phrase).trim();
    return !!n && (hay.includes(` ${n} `) || (squash(phrase).length >= 4 && haySquash.includes(squash(phrase))));
  };
  let score = 0;
  const make = cart.make.trim();
  const makeHit = !!make && has(make);
  if (makeHit) score += 3;
  const modelTokens = norm(cart.model).trim().split(' ').filter((w) => w && (w.length >= 2 || /\d/.test(w)) &&
    !/^(the|and|with|plus|cart|golf)$/.test(w));
  let modelFrac = 0;
  if (modelTokens.length) {
    const hit = modelTokens.filter((w) => hay.includes(` ${w} `)).length;
    modelFrac = hit / modelTokens.length;
    score += 4 * modelFrac;
    if (cart.model.trim() && has(cart.model)) score += 1;
  }
  const yearHit = /^\d{4}$/.test(cart.year) && hay.includes(` ${cart.year} `);
  if (yearHit) score += 1;
  const rest = cart.title.replace(cart.year, '').replace(new RegExp(make.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
    .replace(new RegExp(cart.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
  if (rest && has(rest)) score += 1;
  const strongEnough = modelFrac >= 0.5 || (makeHit && yearHit);
  return strongEnough && score >= 4 ? score : 0;
}

/** Best matching cart for the text (ties → most recently posted). */
export function matchCart(carts: CartLite[], text: string): CartLite | null {
  let best: CartLite | null = null;
  let bestScore = 0;
  for (const c of carts) {
    const sc = scoreCart(c, text);
    if (sc > bestScore + 1e-9 || (sc > 0 && Math.abs(sc - bestScore) < 1e-9 && best && c.postedTs > best.postedTs)) {
      best = c;
      bestScore = sc;
    }
  }
  return best;
}

export const fbLeadId = (sender: string, accountId: string, cartId: string) =>
  `fb_${createHash('sha256').update(`${sender.trim().toLowerCase()}|${accountId}|${cartId}`).digest('hex').slice(0, 24)}`;

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

/** uids with a phone checked in during the last 10 minutes. */
async function onlineUids(now: number): Promise<Set<string>> {
  const snap = await db().collection(C.devices).where('lastSeen', '>=', now - 10 * MIN_MS).get();
  return new Set(snap.docs.filter((d) => d.get('status') !== 'revoked').map((d) => String(d.get('userId') || '')).filter(Boolean));
}

/** Store of a lead: its own, else its cart's, else its website's (wh_domains.locationId), else its phone's. */
async function storeForLead(lead: Json): Promise<string> {
  if (lead.locationId) return String(lead.locationId);
  if (lead.cartId) {
    const c = await db().collection(C.carts).doc(String(lead.cartId)).get();
    if (c.exists) {
      const loc = String(c.get('locationId') || cartSummary(c.data() || {}).locationId || '');
      if (loc) return loc;
    }
  }
  if (lead.whDomainId) {
    const d = await db().collection('wh_domains').doc(String(lead.whDomainId)).get();
    const loc = String(d.get('locationId') || '');
    if (loc) return loc;
  }
  if (lead.deviceId) {
    const d = await db().collection(C.devices).doc(String(lead.deviceId)).get();
    const loc = String(d.get('locationId') || '');
    if (loc) return loc;
  }
  return '';
}

/** Takes the next person for a store and moves the store's pointer (mp_meta/sales_rr). */
async function rotate(storeId: string, candidates: string[], exclude: Set<string>): Promise<string | null> {
  const ref = db().collection(C.meta).doc('sales_rr');
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = String(((snap.get('last') || {}) as Json)[storeId] || '');
    const next = pickNext(candidates, last, exclude);
    if (next) tx.set(ref, {last: {[storeId]: next}, updatedAt: Date.now()}, {merge: true});
    return next;
  });
}

const nameOf = (people: Person[], uid: string) => people.find((p) => p.uid === uid)?.name || 'Someone';

async function notifyAssignee(uid: string, leadId: string, lead: Json, claimMinutes: number, withDeadline: boolean, passed = false) {
  const tail = withDeadline ? ` Tap to claim it — you have ${claimMinutes} min.` : ' Call or text them now.';
  await notify(uid, 'Speed to lead', `${passed ? 'Lead passed to you' : 'New lead'}: ${leadLabel(lead)}.${tail}`,
    {source: 'sales_assign', leadId}, `assign_${leadId}_${uid}_${Date.now()}`);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** New mp_leads doc: pick the owner (round robin) and set locationId/assignedAt/claimDeadline. Returns fields to merge. */
export async function assignNewLead(id: string, lead: Json, s: SalesSettings): Promise<Json> {
  const now = Date.now();
  const patch: Json = {};
  const store = await storeForLead(lead);
  if (store && !lead.locationId) patch.locationId = store;
  if (!isAutoLead(id, lead) || s.assignment.mode !== 'round_robin') return patch;
  if ((lead.status && lead.status !== 'new') || isAnswered(lead) || lead.claimedAt) return patch;
  // A Facebook message can only be answered from the phone that got it — it stays with that phone's owner.
  if (lead.source === 'facebook_message' && lead.ownerUid) return patch;
  if (!store) return patch;
  const [people, online] = await Promise.all([loadPeople(), onlineUids(now)]);
  const {uids, offline} = storeCandidates(people, store, online, s.assignment.onlineOnly);
  if (!uids.length) return patch;
  const next = await rotate(store, uids, new Set());
  if (!next) return patch;
  const claimMinutes = Math.max(1, Number(s.assignment.claimMinutes) || 5);
  // Nobody online: give it to the next person without a claim window (no point passing it around overnight).
  const withDeadline = !offline && uids.length > 1;
  Object.assign(patch, {
    ownerUid: next, assignedAt: now,
    assignHistory: [...(Array.isArray(lead.assignHistory) ? lead.assignHistory : []),
      {uid: next, at: now, reason: offline ? 'round_robin_offline' : 'round_robin'}],
    ...(withDeadline ? {claimDeadline: now + claimMinutes * MIN_MS} : {}),
  });
  await notifyAssignee(next, id, {...lead, ...patch}, claimMinutes, withDeadline);
  return patch;
}

/** Every 5 minutes: unanswered-lead alerts at each alertMinutes mark; reassign unclaimed leads after claimMinutes. */
export async function speedTick(now: number, s: SalesSettings): Promise<void> {
  let people: Person[] | null = null;
  const getPeople = async () => (people = people || await loadPeople());

  // 1. Speed alerts (not during quiet hours — the 8 AM list picks those leads up).
  if (s.speed.enabled && !isQuietHour(now, s.sms.quietStart, s.sms.quietEnd)) {
    const snap = await db().collection(C.leads).where('status', '==', 'new').get();
    for (const d of snap.docs) {
      const lead = d.data() as Json;
      if (!isAutoLead(d.id, lead)) continue;
      const due = dueSpeedMarks(lead, now, s.speed.alertMinutes);
      if (!due.length) continue;
      const mark = due[due.length - 1];
      const waited = minutesLabel((now - Number(lead.createdAt)) / MIN_MS);
      const ppl = await getPeople();
      const owner = String(lead.ownerUid || '');
      const ownerName = owner ? nameOf(ppl, owner) : 'nobody';
      const sends: Array<Promise<unknown>> = [];
      if (owner) {
        sends.push(notify(owner, 'Speed to lead', `Lead waiting ${waited}: ${leadLabel(lead)}. Call or text now.`,
          {source: 'sales_speed', leadId: d.id}, `speed_${d.id}_${mark}_${owner}`));
      }
      if (s.speed.notifyManagers) {
        for (const m of managersFor(ppl, lead.locationId)) {
          if (m.uid === owner) continue;
          sends.push(notify(m.uid, 'Speed to lead', `Lead waiting ${waited} (${ownerName}): ${leadLabel(lead)}.`,
            {source: 'sales_speed', leadId: d.id}, `speed_${d.id}_${mark}_${m.uid}`));
        }
      }
      await Promise.all(sends);
      await d.ref.update({speedAlerted: FV.arrayUnion(...due)});
    }
  }

  // 2. Claim window ran out → next person at the store.
  const late = await db().collection(C.leads).where('claimDeadline', '<=', now).get();
  for (const d of late.docs) {
    const lead = d.data() as Json;
    if (!Number(lead.claimDeadline)) continue;
    if (s.assignment.mode !== 'round_robin' || lead.status !== 'new' || isAnswered(lead)) {
      await d.ref.update({claimDeadline: FV.delete()});
      continue;
    }
    await passLead(d.ref, lead, now, s, await getPeople());
  }
}

/** Gives an unclaimed lead to the next person; after everyone had a turn, tells the managers (once). */
async function passLead(ref: admin.firestore.DocumentReference, lead: Json, now: number, s: SalesSettings, people: Person[]) {
  const store = String(lead.locationId || '');
  const current = String(lead.ownerUid || '');
  const history: Json[] = Array.isArray(lead.assignHistory) ? lead.assignHistory : [];
  const claimMinutes = Math.max(1, Number(s.assignment.claimMinutes) || 5);
  const online = await onlineUids(now);
  const {uids, offline} = store ? storeCandidates(people, store, online, s.assignment.onlineOnly) : {uids: [], offline: true};
  const tried = new Set(history.map((h) => String(h.uid || '')));
  tried.add(current);
  let next = offline ? null : await rotate(store, uids, tried);
  const patch: Json = {};
  if (!next) {
    // Everyone had a turn (or nobody is online).
    if (!lead.claimRoundNotifiedAt) {
      patch.claimRoundNotifiedAt = now;
      const managers = managersFor(people, store || undefined);
      await Promise.all(managers.map((m) => notify(m.uid, 'Speed to lead',
        `Nobody claimed a new lead: ${leadLabel(lead)}. It's with ${nameOf(people, current)} now — please make sure someone calls.`,
        {source: 'sales_speed', leadId: ref.id}, `unclaimed_${ref.id}_${m.uid}`)));
    }
    // Keep it moving among whoever is online, up to 3 rounds; then it stays put.
    if (!offline && history.length < 3 * Math.max(1, uids.length)) next = await rotate(store, uids, new Set([current]));
  }
  if (!next) {
    await ref.update({...patch, claimDeadline: FV.delete()});
    return;
  }
  const entry = {uid: next, at: now, reason: 'not_claimed'};
  await ref.update({
    ...patch, ownerUid: next, assignedAt: now, claimDeadline: now + claimMinutes * MIN_MS,
    assignHistory: [...history, entry].slice(-40), updatedAt: now,
  });
  await notifyAssignee(next, ref.id, lead, claimMinutes, true, true);
  if (current && current !== next) {
    await notify(current, 'Speed to lead', `Lead passed to ${nameOf(people, next)} (not claimed in ${claimMinutes} min): ${leadLabel(lead)}.`,
      {source: 'sales_assign', leadId: ref.id}, `passed_${ref.id}_${current}_${now}`);
  }
}

/** Counts for one person's call list (also used by tests). */
export interface DayCounts {newLeads: number; followUps: number; quotes: number; tasks: number; appointments: number}

export function dayCountsFor(uid: string, leads: Json[], tasks: Json[], appts: Json[], endOfToday: number): DayCounts {
  const mine = leads.filter((l) => l.ownerUid === uid && (l.status === 'new' || l.status === 'talking'));
  return {
    newLeads: mine.filter((l) => l.status === 'new' && !isAnswered(l)).length,
    followUps: mine.filter((l) => Number(l.followUpAt) > 0 && Number(l.followUpAt) <= endOfToday).length,
    quotes: mine.filter((l) => Number(l.quoteOpenedAt) > 0 && !(Number(l.lastContactAt) > Number(l.quoteOpenedAt))).length,
    tasks: tasks.filter((t) => t.ownerUid === uid && t.status === 'open' && Number(t.dueAt) <= endOfToday).length,
    appointments: appts.filter((a) => a.status !== 'cancelled' &&
      (a.ownerUid ? a.ownerUid === uid : !!a.leadId && mine.some((l) => l.id === a.leadId))).length,
  };
}

export function dayListText(c: DayCounts): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    c.newLeads ? plural(c.newLeads, 'new lead', 'new leads') : '',
    c.followUps ? plural(c.followUps, 'follow-up', 'follow-ups') : '',
    c.quotes ? plural(c.quotes, 'quote opened', 'quotes opened') : '',
    c.tasks ? plural(c.tasks, 'to-do', 'to-dos') : '',
    c.appointments ? plural(c.appointments, 'appointment', 'appointments') : '',
  ].filter(Boolean);
  return parts.length ? `Today: ${parts.join(', ')} — open Today` : '';
}

/** Once a day at s.dailyList.hour (New York): each salesperson's call list → one notification. */
export async function dailyCallList(now: number, s: SalesSettings): Promise<void> {
  if (!s.dailyList.enabled) return;
  const day = nyDateKey(now);
  const start = nyTime(day, '00:00');
  const end = nyTime(day, '23:59') + MIN_MS - 1;
  const [people, leadSnap, taskSnap, apptSnap] = await Promise.all([
    loadPeople(),
    db().collection(C.leads).where('status', 'in', ['new', 'talking']).get(),
    db().collection(C.tasks).where('status', '==', 'open').get(),
    db().collection(C.appointments).where('startAt', '>=', start).get(),
  ]);
  const leads = leadSnap.docs.map((d) => ({id: d.id, ...d.data()}) as Json);
  const tasks = taskSnap.docs.map((d) => d.data() as Json);
  const appts = apptSnap.docs.map((d) => d.data() as Json).filter((a) => Number(a.startAt) <= end);
  const ops: Array<(b: admin.firestore.WriteBatch) => void> = [];
  for (const p of people) {
    const text = dayListText(dayCountsFor(p.uid, leads, tasks, appts, end));
    if (!text) continue;
    ops.push((b) => b.set(db().collection(C.notifications).doc(`daily_${day}_${p.uid}`), {
      targetUserId: p.uid, sourceDeviceName: 'Today', text, isHandled: false,
      createdAt: FV.serverTimestamp(), source: 'sales_daily', url: '/mp/today',
    }, {merge: true}));
  }
  await commitAll(ops);
}

/** Phone's Facebook accounts: the one it was set up with, plus accounts linked to the phone or its owner. */
async function accountsForPhone(dev: Json, deviceId: string): Promise<Map<string, Json>> {
  const out = new Map<string, Json>();
  const add = (snap: admin.firestore.QuerySnapshot) => snap.docs.forEach((d) => out.set(d.id, d.data()));
  const uid = String(dev.userId || '');
  const [byDevice, byOwner] = await Promise.all([
    db().collection(C.accounts).where('deviceId', '==', deviceId).get(),
    uid ? db().collection(C.accounts).where('ownerUid', '==', uid).get() : Promise.resolve(null),
  ]);
  add(byDevice);
  if (byOwner) add(byOwner);
  if (dev.accountId && !out.has(String(dev.accountId))) {
    const a = await db().collection(C.accounts).doc(String(dev.accountId)).get();
    out.set(String(dev.accountId), a.exists ? a.data() || {} : {name: dev.accountName || ''});
  }
  return out;
}

function cartLite(d: admin.firestore.QueryDocumentSnapshot, accountIds: string[]): CartLite {
  const data = d.data() as Json;
  const sum = cartSummary(data);
  const posted: Json = data.postedAccounts || {};
  let accountId = '';
  let postedTs = 0;
  for (const a of accountIds) {
    const ts = Number(posted[a]?.ts) || 0;
    if (ts > postedTs) {
      postedTs = ts;
      accountId = a;
    }
  }
  return {id: d.id, title: sum.title, make: sum.make, model: sum.model, year: sum.year, locationId: sum.locationId, accountId, postedTs};
}

/** A phone notification forwarded by the TIGON IOT app. Return true if it was a Facebook buyer message handled here. */
export async function fbMessageEcho(dev: Json, deviceId: string, item: Json, notificationId: string, s: SalesSettings): Promise<boolean> {
  if (!s.fbLeads.enabled) return false;
  const uid = String(dev.userId || '');
  if (!uid) return false;
  const parsed = parseFbNotification(String(item.title || '').slice(0, 300), String(item.text || '').slice(0, 2000));
  if (!parsed || !parsed.sender) return false;
  const accounts = await accountsForPhone(dev, deviceId);
  const ownNames = new Set([...accounts.values()].map((a) => String(a.name || '').trim().toLowerCase()).filter(Boolean));
  if (/^you$/i.test(parsed.sender) || ownNames.has(parsed.sender.toLowerCase())) return false;

  // Carts posted on this phone's accounts, else anything its owner posted.
  const accountIds = [...accounts.keys()];
  const seen = new Map<string, CartLite>();
  await Promise.all(accountIds.map(async (a) => {
    const snap = await db().collection(C.carts).where(new admin.firestore.FieldPath('postedAccounts', a, 'ts'), '>', 0).get();
    snap.docs.forEach((d) => seen.set(d.id, cartLite(d, accountIds)));
  }));
  const text = `${parsed.hint} ${parsed.hint} ${parsed.message}`;
  let cart = matchCart([...seen.values()], text);
  if (!cart) {
    const snap = await db().collection(C.carts).where(new admin.firestore.FieldPath('postedBy', uid), '>', 0).get();
    const mine = snap.docs.filter((d) => !seen.has(d.id)).map((d) => {
      const c = cartLite(d, Object.keys((d.get('postedAccounts') || {}) as Json));
      return c;
    });
    cart = matchCart(mine, text);
  }
  // A plain chat that doesn't mention a listing is not a buyer.
  if (!cart && !parsed.aboutListing) return false;

  const accountId = cart?.accountId || accountIds[0] || '';
  const account = accounts.get(accountId) || {};
  const group = String(account.group || '');
  const locationId = cart?.locationId || (/^T\d+$/.test(group) ? group : '') || String(dev.locationId || '');
  const id = fbLeadId(parsed.sender, accountId, cart?.id || '');
  const ref = db().collection(C.leads).doc(id);
  const now = Date.now();
  const said = parsed.message || parsed.hint;
  const line = `Facebook message${cart ? ` about ${cart.title}` : ''}${said ? `: "${said.slice(0, 300)}"` : ''}`;
  const created = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const notes = String(snap.get('notes') || '');
      tx.update(ref, {
        fbMessages: FV.increment(1), lastInboundAt: now, updatedAt: now, notificationId,
        notes: `${notes}${notes ? '\n' : ''}${line}`.slice(-3000),
      });
      return false;
    }
    tx.create(ref, clean({
      name: parsed.sender.slice(0, 80), phone: '', email: '', channel: 'facebook', status: 'new', source: 'facebook_message',
      ownerUid: uid, deviceId, notificationId, notes: line, cartId: cart?.id, cartTitle: cart?.title,
      locationId: locationId || undefined, fbAccountId: accountId || undefined, fbSender: parsed.sender.slice(0, 80),
      fbMessages: 1, lastInboundAt: now, createdAt: now, updatedAt: now,
    }));
    return true;
  });
  if (created && cart) {
    await db().collection(C.meta).doc('sales_fb_asks').set({[cart.id]: FV.increment(1), updatedAt: now}, {merge: true});
  }
  await db().collection(C.notifications).doc(notificationId).set({leadId: id}, {merge: true}).catch(() => undefined);
  return true;
}
