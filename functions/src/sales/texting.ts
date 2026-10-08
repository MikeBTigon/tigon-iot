// Track 2 — Texting (ideas 2, 5, 10, 20): delivery of mp_sms (texting phone or Twilio), STOP handling, replies,
// instant auto-text to new leads, missed-call text-back, follow-up cadences → tasks, after-sale service reminders.
// Signatures are called from hooks.ts / echoHooks.ts / mpEcho — keep them.
//
// How a text gets out:
//   provider 'phone' (default): the store's texting phone (Android, TIGON IOT app) checks in every 30 seconds
//     (mpEcho ping with canSms) → pendingSmsFor() hands it up to 10 due texts → it sends them from its own number
//     → reports back → recordSmsResults().
//   provider 'twilio': mpSmsQueued sends new texts right away; textingTick sends delayed ones and retries.
// Replies: Twilio → mpSmsInbound (/api/sms/inbound); texting phone → its Messages-app notifications (missedCallEcho).
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall, onRequest} from 'firebase-functions/v2/https';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import {createHash, createHmac, timingSafeEqual} from 'crypto';
import {loadSalesSettings} from './settings';
import type {CadenceStep, SalesSettings} from './settings';
import {
  C, DAY_MS, HOUR_MS, MIN_MS, PUBLIC_ORIGIN, clean, db, e164, fill, firstName, isManagerRole, leadTemplateData,
  loadPeople, managersFor, notify, nyDateKey, prettyPhone, storeCity,
} from './util';
import type {Json, Person} from './util';
import {markLeadTexted, queueSms} from './outbox';
import type {SmsDoc} from './outbox';

const MAX_ATTEMPTS = 3;
const STUCK_MS = 10 * MIN_MS;
/** A queued text nobody could send (no texting phone online) gives up after this. */
const GIVE_UP_MS = 48 * HOUR_MS;
const FROM = 'TIGON texting';

// ---------------------------------------------------------------------------
// Small helpers (exported for tests)
// ---------------------------------------------------------------------------

const str = (v: unknown, n = 4000) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v)).slice(0, n);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const digits10 = (e: string) => e.replace(/\D/g, '').slice(-10);

/** Every way a US number is commonly typed (for `phone in [...]` lookups; max 30). */
export function phoneVariants(raw: unknown): string[] {
  const e = e164(raw);
  if (!e) return [];
  const d = digits10(e);
  const [a, b, c] = [d.slice(0, 3), d.slice(3, 6), d.slice(6)];
  return Array.from(new Set([
    e, d, `1${d}`, `${a}-${b}-${c}`, `(${a}) ${b}-${c}`, `(${a})${b}-${c}`, `${a}.${b}.${c}`, `${a} ${b} ${c}`,
    `+1-${a}-${b}-${c}`, `+1 (${a}) ${b}-${c}`, `+1 ${a}-${b}-${c}`, `+1 ${a} ${b} ${c}`, `1-${a}-${b}-${c}`,
    `+1(${a})${b}-${c}`, `+1 ${d}`, `${a}${b}-${c}`,
  ])).slice(0, 30);
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/;
/** First US phone number in a piece of text ('' if none — e.g. only a contact name is shown). */
export function findPhone(text: string): string {
  const m = PHONE_RE.exec(text || '');
  if (!m) return '';
  const before = m.index > 0 ? text[m.index - 1] : '';
  if (/\d/.test(before)) return '';
  return e164(`${m[1]}${m[2]}${m[3]}`);
}

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'STOP ALL', 'OPT OUT', 'OPTOUT', 'REVOKE']);
const START_WORDS = new Set(['START', 'UNSTOP', 'RESUME']);
const keyword = (body: string) => body.trim().toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
export const isStopWord = (body: string) => STOP_WORDS.has(keyword(body));
export const isStartWord = (body: string) => START_WORDS.has(keyword(body));

const DIALER_PACKAGES = new Set([
  'com.google.android.dialer', 'com.samsung.android.dialer', 'com.android.dialer', 'com.android.server.telecom',
  'com.android.phone', 'com.samsung.android.incallui', 'com.android.incallui', 'com.samsung.android.app.telephonyui',
  'com.motorola.dialer', 'com.oneplus.dialer', 'com.oplus.dialer', 'com.coloros.phonemanager', 'com.asus.contacts',
  'com.lge.phone', 'com.htc.contacts', 'com.google.android.apps.googlevoice', 'com.miui.voip', 'com.android.contacts',
]);
export const SMS_APP_PACKAGES = new Set([
  'com.google.android.apps.messaging', 'com.samsung.android.messaging', 'com.android.mms', 'com.motorola.messaging',
  'com.oneplus.mms', 'com.android.messaging', 'com.sonyericsson.conversations', 'com.lge.message', 'com.htc.sense.mms',
  'com.verizon.messaging.vzmsgs', 'com.textra', 'com.google.android.apps.googlevoice',
]);

/** A forwarded phone notification is a missed call? → {number} ('' when only a contact name is shown). */
export function parseMissedCall(item: Json): {missed: boolean; number: string} {
  const pkg = str(item.pkg, 120).toLowerCase();
  const cat = str(item.cat, 30).toLowerCase();
  const title = str(item.title, 300);
  const text = str(item.text, 1000);
  const all = `${title} ${text}`;
  const dialer = DIALER_PACKAGES.has(pkg) || /dialer|telecom|incallui|telephony/.test(pkg);
  // Only the phone app's notifications (Messenger / WhatsApp calls stay with the Facebook filter).
  if (!dialer && item.missedCall !== true) return {missed: false, number: ''};
  if (cat !== 'missed_call' && !/missed/i.test(all)) return {missed: false, number: ''};
  if (/voicemail/i.test(all) && !/missed call/i.test(all)) return {missed: false, number: ''};
  return {missed: true, number: findPhone(title) || findPhone(text)};
}

/** Twilio's X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + sorted key+value pairs)). */
export function twilioSignature(authToken: string, url: string, params: Record<string, unknown>): string {
  const data = Object.keys(params).sort().reduce((acc, k) => {
    const v = params[k];
    const vals = Array.isArray(v) ? v : [v];
    return acc + vals.map((x) => `${k}${x === undefined || x === null ? '' : String(x)}`).join('');
  }, url);
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

export function validTwilioSignature(authToken: string, signature: string, urls: string[], params: Record<string, unknown>): boolean {
  if (!authToken || !signature) return false;
  const given = Buffer.from(signature);
  return urls.some((u) => {
    const want = Buffer.from(twilioSignature(authToken, u, params));
    return want.length === given.length && timingSafeEqual(want, given);
  });
}

const sortedSteps = (steps: CadenceStep[]) =>
  (Array.isArray(steps) ? steps : []).filter((x) => x && Number.isFinite(Number(x.day))).slice().sort((a, b) => Number(a.day) - Number(b.day));

/** Which cadence step is due now for a lead (the latest one that's due — older missed ones are skipped). */
export function dueCadenceStep(lead: Json, steps: CadenceStep[], now: number): {index: number; step: CadenceStep; dueAt: number} | null {
  if (!lead || lead.cadenceStopped || typeof lead.cadenceStartedAt !== 'number') return null;
  if (lead.status !== 'new' && lead.status !== 'talking') return null;
  const list = sortedSteps(steps);
  const from = Math.max(0, Number(lead.cadenceStep) || 0);
  let found: {index: number; step: CadenceStep; dueAt: number} | null = null;
  for (let i = from; i < list.length; i++) {
    const dueAt = lead.cadenceStartedAt + Number(list[i].day) * DAY_MS;
    if (dueAt > now) break;
    found = {index: i, step: list[i], dueAt};
  }
  return found;
}

/** Same day-of-month, `months` later (clamped to the month's last day). */
export function addMonths(ts: number, months: number): number {
  const d = new Date(ts);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.round(months));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

const VERB: Record<string, string> = {sms: 'text', call: 'call', email: 'email'};
const SERVICE_LABEL: Record<string, string> = {
  battery: 'Battery check', accessories: 'Accessories offer', upgrade: 'Upgrade offer', checkup: 'Yearly check-up',
};

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

export const twilioKeys = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
const twilioOn = (s: SalesSettings) => s.sms.provider === 'twilio' && twilioKeys();

/** Stores this phone sends for ('*' = it's the fallback phone). */
function storesOfPhone(deviceId: string, s: SalesSettings): {stores: string[]; isDefault: boolean} {
  const map = s.sms.senderDeviceByStore || {};
  return {
    stores: Object.keys(map).filter((k) => map[k] === deviceId),
    isDefault: !!deviceId && s.sms.defaultSenderDeviceId === deviceId,
  };
}
const isTextingPhone = (deviceId: string, s: SalesSettings) => {
  const x = storesOfPhone(deviceId, s);
  return x.isDefault || x.stores.length > 0;
};
/** The phone a store's texts go out from ('' = none set up). */
function phoneForStore(storeId: string, s: SalesSettings): string {
  return (storeId && s.sms.senderDeviceByStore?.[storeId]) || s.sms.defaultSenderDeviceId || '';
}

async function ownerNameOf(uid: string | undefined, people?: Person[]): Promise<string> {
  if (!uid) return '';
  const p = people?.find((x) => x.uid === uid);
  if (p) return p.name;
  try {
    return String((await db().collection(C.users).doc(uid).get()).get('name') || '');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// New lead / lead changed
// ---------------------------------------------------------------------------

/** New lead (after assignment): auto-text, cadence enrollment. */
export async function onNewLeadTexting(id: string, lead: Json, s: SalesSettings): Promise<void> {
  if (!lead || lead.status === 'sold' || lead.status === 'lost') return;
  const ref = db().collection(C.leads).doc(id);
  const patch: Json = {};
  // 10. Follow-up cadence: every open lead starts at step 0 (textingTick turns due steps into tasks).
  if (typeof lead.cadenceStartedAt !== 'number') {
    patch.cadenceStartedAt = Number(lead.createdAt) || Date.now();
    patch.cadenceStep = 0;
  }
  // 2. Instant auto-text (not the human first response: createdBy '' → markLeadTexted is never called for it).
  const a = s.autoText;
  const channelOk = (a.channels || []).includes(String(lead.channel || '')) || lead.source === 'website';
  if (a.enabled && channelOk && lead.source !== 'missed_call' && e164(lead.phone) && a.template.trim()) {
    const ownerName = await ownerNameOf(lead.ownerUid);
    const smsId = await queueSms({
      to: lead.phone, kind: 'auto_lead', storeId: lead.locationId || '', leadId: id, createdBy: '',
      dedupeKey: `auto_${id}`, body: fill(a.template, leadTemplateData(lead, ownerName)),
    });
    if (smsId) patch.autoTextId = smsId;
  }
  if (Object.keys(patch).length) await ref.set(patch, {merge: true});
}

/** Lead changed (e.g. sold → service reminders; lost/sold → stop cadence). */
export async function onLeadUpdatedTexting(id: string, before: Json, after: Json, s: SalesSettings): Promise<void> {
  const closed = after.status === 'sold' || after.status === 'lost';
  const wasClosed = before.status === 'sold' || before.status === 'lost';
  if (closed && !wasClosed) {
    if (typeof after.cadenceStartedAt === 'number' && !after.cadenceStopped) {
      await db().collection(C.leads).doc(id).set({cadenceStopped: true, cadenceStoppedReason: after.status}, {merge: true});
    }
    // Open cadence to-dos for this lead are no longer needed.
    const tasks = await db().collection(C.tasks).where('leadId', '==', id).get();
    const batch = db().batch();
    let n = 0;
    for (const t of tasks.docs) {
      if (t.get('kind') === 'cadence' && t.get('status') === 'open') {
        batch.update(t.ref, {status: 'skipped', doneAt: Date.now(), skippedReason: `lead ${after.status}`});
        n++;
      }
    }
    if (n) await batch.commit();
  }
  // 20. After-sale follow-ups: one to-do per service step (never sent automatically).
  if (before.status !== 'sold' && after.status === 'sold' && s.service.enabled) {
    await createServiceTasks(id, after, s);
  }
}

async function createServiceTasks(id: string, lead: Json, s: SalesSettings) {
  const steps = (s.service.steps || []).filter((x) => x && Number(x.months) > 0).slice().sort((a, b) => a.months - b.months);
  const soldAt = Number(lead.soldAt) || Date.now();
  const ownerName = await ownerNameOf(lead.ownerUid);
  const data = leadTemplateData(lead, ownerName);
  const now = Date.now();
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const ref = db().collection(C.tasks).doc(`svc_${id}_${i}`);
    const task = clean({
      ownerUid: String(lead.ownerUid || ''), leadId: id, customerId: lead.customerId || undefined, kind: 'service',
      serviceKind: st.kind, storeId: lead.locationId || undefined,
      title: `${SERVICE_LABEL[st.kind] || 'Follow-up'}: text ${firstName(lead.name)} (${st.months} months after the sale)`,
      suggestedText: fill(st.template, data), channel: 'sms', phone: str(lead.phone, 40), dueAt: addMonths(soldAt, st.months),
      status: 'open', createdAt: now,
    });
    try {
      await ref.create(task);
    } catch {
      // already scheduled (sold twice)
    }
  }
}

// ---------------------------------------------------------------------------
// Every 5 minutes
// ---------------------------------------------------------------------------

/** Every 5 minutes: due cadence steps → tasks / texts; due service reminders; Twilio retries. */
export async function textingTick(now: number, s: SalesSettings): Promise<void> {
  await recoverStuck(now);
  await queuedHousekeeping(now, s);
  if (s.cadence.enabled) await hourly('cadence', now, () => cadenceTick(now, s));
}

/** Runs `fn` at most once every ~hour (shared across instances). */
async function hourly(key: string, now: number, fn: () => Promise<void>) {
  const ref = db().collection(C.meta).doc('sales_texting');
  const go = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (now - Number(snap.get(`${key}At`) || 0) < 55 * MIN_MS) return false;
    tx.set(ref, {[`${key}At`]: now}, {merge: true});
    return true;
  });
  if (go) await fn();
}

/** Texts a phone/Twilio took but never confirmed → back in the queue (or failed after 3 tries). */
async function recoverStuck(now: number) {
  const snap = await db().collection(C.sms).where('status', '==', 'sending').get();
  const batch = db().batch();
  let n = 0;
  for (const d of snap.docs) {
    const x = d.data() as SmsDoc;
    const taken = Number(x.takenAt || x.sendAt || x.createdAt || 0);
    if (now - taken < STUCK_MS) continue;
    if ((x.attempts || 0) >= MAX_ATTEMPTS) {
      batch.update(d.ref, {status: 'failed', error: 'The texting phone never confirmed this text', failedAt: now});
    } else {
      batch.update(d.ref, {status: 'queued', error: 'Retrying — the texting phone didn\'t confirm it'});
    }
    n++;
  }
  if (n) await batch.commit();
}

/** Twilio: send due + retry. Phone: flag texts that have no texting phone, give up after 48 h. */
async function queuedHousekeeping(now: number, s: SalesSettings) {
  const snap = await db().collection(C.sms).where('status', '==', 'queued').limit(500).get();
  const due = snap.docs.filter((d) => Number(d.get('sendAt') || 0) <= now)
    .sort((a, b) => Number(a.get('sendAt')) - Number(b.get('sendAt')));
  if (twilioOn(s)) {
    for (const d of due.slice(0, 60)) await twilioSend(d.id, s);
    return;
  }
  const batch = db().batch();
  let n = 0;
  for (const d of due) {
    const x = d.data() as SmsDoc;
    if (now - Number(x.createdAt || now) > GIVE_UP_MS) {
      batch.update(d.ref, {status: 'failed', error: 'Not sent — no texting phone picked it up for 2 days', failedAt: now});
      n++;
    } else if (!phoneForStore(x.storeId, s) && !x.error) {
      batch.update(d.ref, {error: 'Waiting — no texting phone is set up for this store yet'});
      n++;
    }
  }
  if (n) await batch.commit();
}

async function cadenceTick(now: number, s: SalesSettings) {
  const steps = sortedSteps(s.cadence.steps);
  if (!steps.length) return;
  const [a, b] = await Promise.all([
    db().collection(C.leads).where('status', '==', 'new').get(),
    db().collection(C.leads).where('status', '==', 'talking').get(),
  ]);
  const people = await loadPeople();
  for (const d of [...a.docs, ...b.docs]) {
    const lead = d.data();
    const due = dueCadenceStep(lead, steps, now);
    if (!due) continue;
    try {
      await createCadenceTask(d.id, lead, due, people);
    } catch (e) {
      logger.warn('cadence task failed', d.id, e);
    }
  }
}

async function createCadenceTask(id: string, lead: Json, due: {index: number; step: CadenceStep; dueAt: number}, people: Person[]) {
  const ownerName = await ownerNameOf(lead.ownerUid, people);
  const data = leadTemplateData(lead, ownerName);
  const filled = fill(due.step.template || '', data);
  const first = firstName(lead.name);
  const verb = VERB[due.step.channel] || 'contact';
  const about = lead.cartTitle ? ` about the ${lead.cartTitle}` : '';
  const title = due.step.channel === 'sms' ?
    `Day ${due.step.day}: ${verb} ${first}${about}` :
    `Day ${due.step.day}: ${filled || `${verb} ${first}${about}`}`;
  const now = Date.now();
  const leadRef = db().collection(C.leads).doc(id);
  const taskRef = db().collection(C.tasks).doc(`cad_${id}_${due.index}`);
  await db().runTransaction(async (tx) => {
    const [l, t] = await Promise.all([tx.get(leadRef), tx.get(taskRef)]);
    if (!l.exists || l.get('cadenceStopped')) return;
    if ((Number(l.get('cadenceStep')) || 0) > due.index) return; // another run got here first
    if (!t.exists && lead.ownerUid) {
      tx.create(taskRef, clean({
        ownerUid: String(lead.ownerUid), leadId: id, kind: 'cadence', cadenceStep: due.index, title: title.slice(0, 200),
        suggestedText: due.step.channel === 'sms' ? filled : undefined, channel: due.step.channel,
        phone: str(lead.phone, 40), email: due.step.channel === 'email' ? str(lead.email, 200) : undefined,
        storeId: lead.locationId || undefined, dueAt: due.dueAt, status: 'open', createdAt: now,
      }));
    }
    tx.update(leadRef, {cadenceStep: due.index + 1, cadenceLastAt: now});
  });
}

// ---------------------------------------------------------------------------
// Texting phone
// ---------------------------------------------------------------------------

/** Texting phone check-in: texts this phone should send now (max 10). Marks them 'sending'. */
export async function pendingSmsFor(deviceId: string): Promise<Json[]> {
  if (!deviceId) return [];
  const s = await loadSalesSettings();
  if (twilioOn(s)) return [];
  const {stores, isDefault} = storesOfPhone(deviceId, s);
  if (!isDefault && !stores.length) return [];
  const now = Date.now();
  const map = s.sms.senderDeviceByStore || {};
  const snap = await db().collection(C.sms).where('status', '==', 'queued').limit(500).get();
  const mine = snap.docs.filter((d) => {
    if (Number(d.get('sendAt') || 0) > now) return false;
    const store = String(d.get('storeId') || '');
    if (store && stores.includes(store)) return true;
    return isDefault && (!store || !map[store]);
  }).sort((a, b) => Number(a.get('sendAt')) - Number(b.get('sendAt'))).slice(0, 10);
  if (!mine.length) return [];
  return db().runTransaction(async (tx) => {
    const refs = mine.map((d) => d.ref);
    const docs = await Promise.all(refs.map((r) => tx.get(r)));
    const outs = await Promise.all(docs.map((d) => tx.get(db().collection(C.smsOptOut).doc(String(d.get('to') || '_')))));
    const items: Json[] = [];
    docs.forEach((d, i) => {
      if (!d.exists || d.get('status') !== 'queued') return;
      if (outs[i].exists) {
        tx.update(d.ref, {status: 'skipped', error: 'They replied STOP — not texted'});
        return;
      }
      tx.update(d.ref, {
        status: 'sending', provider: 'phone', deviceId, attempts: (Number(d.get('attempts')) || 0) + 1, takenAt: now,
      });
      items.push({id: d.id, to: String(d.get('to')), body: String(d.get('body'))});
    });
    return items;
  });
}

/** Texting phone reports: [{id, ok, error?}]. */
export async function recordSmsResults(deviceId: string, results: Json[]): Promise<void> {
  const now = Date.now();
  for (const r of (Array.isArray(results) ? results : []).slice(0, 50)) {
    const id = str(r?.id, 200);
    if (!id || id.includes('/')) continue;
    const ref = db().collection(C.sms).doc(id);
    const res = await db().runTransaction(async (tx) => {
      const d = await tx.get(ref);
      if (!d.exists || d.get('deviceId') !== deviceId) return null;
      const status = d.get('status');
      if (status !== 'sending' && status !== 'queued') return null;
      if (r.ok === true) {
        tx.update(ref, {status: 'sent', sentAt: now, error: ''});
        return {sent: true, leadId: d.get('leadId'), createdBy: d.get('createdBy')};
      }
      const error = str(r.error, 300) || 'The phone could not send it';
      if ((Number(d.get('attempts')) || 0) >= MAX_ATTEMPTS) {
        tx.update(ref, {status: 'failed', error, failedAt: now});
      } else {
        tx.update(ref, {status: 'queued', error: `Retrying — ${error}`, sendAt: now + 2 * MIN_MS});
      }
      return {sent: false};
    });
    if (res?.sent && res.createdBy && res.leadId) await markLeadTexted(String(res.leadId), now).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Twilio
// ---------------------------------------------------------------------------

/** Sends one queued text through Twilio (claims it first so the trigger and the tick never both send it). */
export async function twilioSend(id: string, s: SalesSettings): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (!sid || !token) return;
  const ref = db().collection(C.sms).doc(id);
  const now = Date.now();
  const doc = await db().runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (!d.exists || d.get('status') !== 'queued' || Number(d.get('sendAt') || 0) > now + 30_000) return null;
    const out = await tx.get(db().collection(C.smsOptOut).doc(String(d.get('to') || '_')));
    if (out.exists) {
      tx.update(ref, {status: 'skipped', error: 'They replied STOP — not texted'});
      return null;
    }
    const attempts = (Number(d.get('attempts')) || 0) + 1;
    tx.update(ref, {status: 'sending', provider: 'twilio', attempts, takenAt: now});
    return {...(d.data() as SmsDoc), attempts};
  });
  if (!doc) return;
  const from = s.sms.twilioFromByStore?.[doc.storeId] || s.sms.twilioDefaultFrom;
  if (!e164(from)) {
    await ref.update({status: 'failed', error: 'No Twilio number set for this store (Sell more → Texting)', failedAt: now});
    return;
  }
  try {
    const form = new URLSearchParams({To: doc.to, From: e164(from), Body: doc.body, StatusCallback: `${PUBLIC_ORIGIN}/api/sms/status`});
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: form.toString(),
    });
    const j = (await r.json().catch(() => ({}))) as Json;
    if (r.ok && j.sid) {
      await ref.update({status: 'sent', sentAt: Date.now(), sid: String(j.sid), error: ''});
      if (doc.createdBy && doc.leadId) await markLeadTexted(doc.leadId).catch(() => undefined);
      return;
    }
    const code = Number(j.code) || 0;
    const msg = `Twilio: ${str(j.message, 200) || `HTTP ${r.status}`}`;
    if (code === 21610) {
      // The number unsubscribed at Twilio (replied STOP before).
      await db().collection(C.smsOptOut).doc(doc.to).set({phone: doc.to, at: Date.now(), via: 'twilio', reason: 'twilio 21610'}, {merge: true});
    }
    const permanent = (r.status >= 400 && r.status < 500 && r.status !== 429) || doc.attempts >= MAX_ATTEMPTS;
    await ref.update(permanent ? {status: 'failed', error: msg, failedAt: Date.now()} :
      {status: 'queued', error: `Retrying — ${msg}`, sendAt: Date.now() + 5 * MIN_MS});
  } catch (e) {
    const msg = `Twilio: ${(e as Error).message || 'network error'}`;
    await ref.update(doc.attempts >= MAX_ATTEMPTS ? {status: 'failed', error: msg, failedAt: Date.now()} :
      {status: 'queued', error: `Retrying — ${msg}`, sendAt: Date.now() + 5 * MIN_MS});
  }
}

/** New text in the outbox: remember the lead owner (so they can read it); Twilio sends it right away. */
export const mpSmsQueued = onDocumentCreated(`${C.sms}/{id}`, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const x = snap.data() as SmsDoc;
  try {
    if (x.leadId && !x.ownerUid) {
      const owner = String((await db().collection(C.leads).doc(x.leadId).get()).get('ownerUid') || '');
      if (owner) await snap.ref.set({ownerUid: owner}, {merge: true});
    }
  } catch (e) {
    logger.warn('mpSmsQueued: owner lookup failed', e);
  }
  if (x.status !== 'queued') return;
  const s = await loadSalesSettings();
  if (twilioOn(s) && Number(x.sendAt || 0) <= Date.now() + 30_000) await twilioSend(snap.id, s);
});

// ---------------------------------------------------------------------------
// Replies + STOP (shared by Twilio and the texting phone)
// ---------------------------------------------------------------------------

/** Latest lead for a phone number: texts we sent to it first, then the lead's phone in any common format. */
export async function findLeadByPhone(phone: string): Promise<{id: string; data: Json} | null> {
  const e = e164(phone);
  if (!e) return null;
  const sms = await db().collection(C.sms).where('to', '==', e).limit(50).get();
  const withLead = sms.docs.filter((d) => d.get('leadId')).sort((a, b) => Number(b.get('createdAt') || 0) - Number(a.get('createdAt') || 0));
  for (const d of withLead.slice(0, 3)) {
    const l = await db().collection(C.leads).doc(String(d.get('leadId'))).get();
    if (l.exists) return {id: l.id, data: l.data() as Json};
  }
  const leads = await db().collection(C.leads).where('phone', 'in', phoneVariants(e)).limit(50).get();
  const best = leads.docs.sort((a, b) => Number(b.get('createdAt') || 0) - Number(a.get('createdAt') || 0))[0];
  return best ? {id: best.id, data: best.data() as Json} : null;
}

async function findLeadByName(name: string): Promise<{id: string; data: Json} | null> {
  const n = name.trim();
  if (!n || n.length > 120) return null;
  const leads = await db().collection(C.leads).where('name', '==', n).limit(20).get();
  const best = leads.docs.sort((a, b) => Number(b.get('createdAt') || 0) - Number(a.get('createdAt') || 0))[0];
  return best ? {id: best.id, data: best.data() as Json} : null;
}

interface Inbound {
  /** e164 ('' when the phone only showed a contact name). */
  from: string;
  /** Contact name shown on the texting phone (when there's no number). */
  fromName?: string;
  body: string;
  via: 'twilio' | 'phone';
  storeId?: string;
  deviceId?: string;
  /** Who hears about replies that match no lead. */
  fallbackUids: string[];
  /** Doc id (dedupes retries). */
  docId: string;
  sid?: string;
}

export async function handleInbound(m: Inbound): Promise<{leadId?: string; stop?: boolean; start?: boolean; dup?: boolean}> {
  const now = Date.now();
  const lead = m.from ? await findLeadByPhone(m.from) : m.fromName ? await findLeadByName(m.fromName) : null;
  const from = m.from || e164(lead?.data.phone) || '';
  const ref = db().collection(C.smsInbound).doc(m.docId);
  try {
    await ref.create(clean({
      from, fromName: m.fromName || undefined, body: m.body.slice(0, 1600), via: m.via, storeId: m.storeId || lead?.data.locationId || undefined,
      leadId: lead?.id, deviceId: m.deviceId, sid: m.sid, receivedAt: now,
    }));
  } catch {
    return {dup: true}; // same reply delivered twice
  }
  const who = lead ? String(lead.data.name || prettyPhone(from)) : m.fromName || prettyPhone(from) || 'a customer';
  const stop = isStopWord(m.body);
  const start = !stop && isStartWord(m.body);
  if (stop && from) {
    await db().collection(C.smsOptOut).doc(from).set(clean({
      phone: from, at: now, via: m.via, storeId: m.storeId || undefined, leadId: lead?.id, word: keyword(m.body),
    }));
    // Nothing else goes out to them.
    const queued = await db().collection(C.sms).where('to', '==', from).limit(200).get();
    const batch = db().batch();
    let n = 0;
    for (const d of queued.docs) {
      if (d.get('status') === 'queued') {
        batch.update(d.ref, {status: 'skipped', error: 'They replied STOP — not texted'});
        n++;
      }
    }
    if (n) await batch.commit();
  } else if (start && from) {
    await db().collection(C.smsOptOut).doc(from).delete();
  }
  if (lead) {
    await db().collection(C.leads).doc(lead.id).set({lastInboundAt: now, ...(stop ? {smsConsent: false, cadenceStopped: true} : {})}, {merge: true});
  }
  const text = stop ? `${who} replied STOP — we won't text them again.` :
    start ? `${who} replied START — texts to them are back on.` :
      `Reply from ${who}: ${m.body}`;
  const targets = lead?.data.ownerUid ? [String(lead.data.ownerUid)] : m.fallbackUids;
  for (const uid of Array.from(new Set(targets)).slice(0, 10)) {
    await notify(uid, FROM, text, clean({source: 'sales-texting', kind: 'sms_reply', leadId: lead?.id, phone: from || undefined}), `smsin_${m.docId}_${uid}`.slice(0, 1400));
  }
  return {leadId: lead?.id, stop, start};
}

/** Base URLs Twilio may have signed (Hosting domain, the raw function host, or TWILIO_WEBHOOK_BASE). */
function signedUrlCandidates(req: {originalUrl?: string; url?: string; headers: Record<string, unknown>}): string[] {
  const path = req.originalUrl || req.url || '/';
  const fwdHost = str(req.headers['x-forwarded-host'], 200).split(',')[0].trim();
  const host = str(req.headers['host'], 200);
  const base = (process.env.TWILIO_WEBHOOK_BASE || '').replace(/\/$/, '');
  return Array.from(new Set([
    `${PUBLIC_ORIGIN}${path}`, fwdHost ? `https://${fwdHost}${path}` : '', host ? `https://${host}${path}` : '',
    base ? `${base}${path}` : '',
  ].filter(Boolean)));
}

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Twilio webhooks: /api/sms/inbound (a customer texted the store's Twilio number) and /api/sms/status. */
export const mpSmsInbound = onRequest({region: 'us-central1', memory: '256MiB', timeoutSeconds: 30}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('');
    return;
  }
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (!token) {
    res.status(503).send('Texting by Twilio is not set up');
    return;
  }
  const params = (typeof req.body === 'object' && req.body && !Buffer.isBuffer(req.body) ? req.body : {}) as Record<string, unknown>;
  const sig = str(req.headers['x-twilio-signature'], 200);
  if (!validTwilioSignature(token, sig, signedUrlCandidates(req), params)) {
    logger.warn('mpSmsInbound: bad Twilio signature');
    res.status(403).send('');
    return;
  }
  try {
    const path = (req.originalUrl || req.url || '').split('?')[0];
    if (/\/status\/?$/.test(path)) {
      // Delivery report for a text we sent.
      const msgSid = str(params.MessageSid, 80);
      const status = str(params.MessageStatus, 30);
      if (msgSid) {
        const q = await db().collection(C.sms).where('sid', '==', msgSid).limit(1).get();
        const d = q.docs[0];
        if (d) {
          if (status === 'delivered') await d.ref.update({deliveredAt: Date.now()});
          else if (status === 'failed' || status === 'undelivered') {
            await d.ref.update({status: 'failed', error: `Not delivered by the phone company${params.ErrorCode ? ` (code ${str(params.ErrorCode, 10)})` : ''}`, failedAt: Date.now()});
          }
        }
      }
      res.type('text/xml').send(EMPTY_TWIML);
      return;
    }
    const from = e164(params.From);
    const to = e164(params.To);
    const body = str(params.Body, 1600).trim();
    const s = await loadSalesSettings();
    const storeId = Object.keys(s.sms.twilioFromByStore || {}).find((k) => e164(s.sms.twilioFromByStore[k]) === to) || '';
    const people = await loadPeople();
    if (from) {
      await handleInbound({
        from, body, via: 'twilio', storeId, fallbackUids: managersFor(people, storeId || undefined).map((p) => p.uid),
        docId: `tw_${str(params.MessageSid, 80).replace(/[^A-Za-z0-9]/g, '') || sha(`${from}|${body}|${Date.now()}`).slice(0, 24)}`,
        sid: str(params.MessageSid, 80) || undefined,
      });
    }
    res.type('text/xml').send(EMPTY_TWIML);
  } catch (e) {
    logger.error('mpSmsInbound failed', e);
    res.type('text/xml').status(200).send(EMPTY_TWIML);
  }
});

// ---------------------------------------------------------------------------
// Forwarded phone notifications: missed calls, and replies on the texting phone
// ---------------------------------------------------------------------------

const NOT_A_MESSAGE = /(message not sent|not sent|couldn.t send|failed to send|sending failed|new messages?$|^\d+ new|messages? (are )?syncing|chat features|tap to|backup)/i;

/** A forwarded phone notification: missed call → text-back (+ lead). Return true if handled. */
export async function missedCallEcho(dev: Json, deviceId: string, item: Json, s: SalesSettings): Promise<boolean> {
  const pkg = str(item.pkg, 120).toLowerCase();
  const title = str(item.title, 300).trim();
  const text = str(item.text, 4000).trim();
  const ownerUid = String(dev.userId || '');

  // A customer texted the texting phone (its Messages app notification).
  if ((SMS_APP_PACKAGES.has(pkg) || item.sms === true) && pkg !== 'com.google.android.apps.googlevoice' && isTextingPhone(deviceId, s)) {
    if (!text || NOT_A_MESSAGE.test(title) || NOT_A_MESSAGE.test(text)) return true;
    // Short codes (bank codes, carrier messages) are not customers.
    if (/^\d{3,6}$/.test(title.replace(/\s/g, ''))) return true;
    const from = findPhone(title);
    const {stores} = storesOfPhone(deviceId, s);
    const ownerStore = await storeOfUser(ownerUid);
    await handleInbound({
      from, fromName: from ? undefined : title, body: text, via: 'phone', storeId: stores[0] || ownerStore, deviceId,
      fallbackUids: ownerUid ? [ownerUid] : [],
      docId: `ph_${sha(`${deviceId}|${str(item.key, 300)}|${title}|${text}`).slice(0, 32)}`,
    });
    return true;
  }

  const mc = parseMissedCall(item);
  if (!mc.missed) return false;
  if (!mc.number || !s.missedCall.enabled || !ownerUid) return true;
  const now = Number(item.postedAt) || Date.now();
  const day = nyDateKey(now);
  const d10 = digits10(mc.number);
  const storeId = await storeOfUser(ownerUid);
  const people = await loadPeople();
  const owner = people.find((p) => p.uid === ownerUid);
  let leadId = '';
  let leadName = '';
  const existing = await findLeadByPhone(mc.number);
  // Open lead or past buyer → link to it; nobody (or a lost lead coming back) → new lead.
  if (existing && existing.data.status !== 'lost') {
    leadId = existing.id;
    leadName = realName(existing.data.name);
  } else if (s.missedCall.createLead) {
    const ref = db().collection(C.leads).doc(`mc_${d10}_${day.replace(/-/g, '')}`);
    const t = Date.now();
    try {
      await ref.create(clean({
        name: prettyPhone(mc.number), phone: prettyPhone(mc.number), email: '', channel: 'phone', source: 'missed_call',
        status: 'new', ownerUid, notes: `Missed call on ${String(dev.deviceName || 'a team phone')} — we texted them back.`,
        locationId: storeId || undefined, deviceId, createdAt: t, updatedAt: t,
      }));
    } catch {
      // already created today
    }
    leadId = ref.id;
  }
  const lead = leadId ? (await db().collection(C.leads).doc(leadId).get()).data() || {} : {};
  const data = leadTemplateData({...lead, locationId: lead.locationId || storeId, name: leadName || realName(lead.name)}, owner?.name || '');
  const smsId = s.missedCall.template.trim() ? await queueSms({
    to: mc.number, kind: 'missed_call', storeId: String(lead.locationId || storeId || ''), leadId: leadId || undefined, createdBy: '',
    dedupeKey: `mc_${d10}_${day}`, body: fill(s.missedCall.template, data),
  }) : null;
  const who = leadName ? `${leadName} (${prettyPhone(mc.number)})` : prettyPhone(mc.number);
  const msg = smsId ? `Missed call from ${who} — we texted them back.` : `Missed call from ${who}.`;
  await notify(ownerUid, String(dev.deviceName || FROM), `${msg}${leadId ? ' It\'s in your leads.' : ''}`,
    clean({source: 'sales-texting', kind: 'missed_call', leadId: leadId || undefined, phone: mc.number}), `mc_${d10}_${day}_${ownerUid}`);
  return true;
}

/** A lead's name, or '' when it's just the phone number (missed-call leads). */
const realName = (n: unknown) => (findPhone(str(n, 200)) ? '' : str(n, 200).trim());

async function storeOfUser(uid: string): Promise<string> {
  if (!uid) return '';
  try {
    return String((await db().collection(C.users).doc(uid).get()).get('location') || '');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Settings page helper (callable)
// ---------------------------------------------------------------------------

/**
 * mpSmsAdmin({action}):
 *   'status'   → {twilioKeys, provider, phones: {storeId: deviceId}}
 *   'setPhone' → {storeId, deviceId|''} makes a phone the store's texting phone (managers; admins edit the rest of
 *                the texting settings on the settings page).
 */
export const mpSmsAdmin = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const me = await db().collection(C.users).doc(req.auth.uid).get();
  const role = String(me.get('role') || '');
  if (!me.exists) throw new HttpsError('permission-denied', 'Not on the team');
  const action = str(req.data?.action, 20);
  const s = await loadSalesSettings(true);
  if (action === 'status') {
    return {twilioKeys: twilioKeys(), provider: s.sms.provider, phones: s.sms.senderDeviceByStore || {}, defaultPhone: s.sms.defaultSenderDeviceId || ''};
  }
  if (action === 'setPhone') {
    if (!isManagerRole(role)) throw new HttpsError('permission-denied', 'Only managers can pick the texting phone');
    const storeId = str(req.data?.storeId, 10);
    const deviceId = str(req.data?.deviceId, 200);
    if (!/^T\d{1,2}$/.test(storeId) && storeId !== '*') throw new HttpsError('invalid-argument', 'Pick a store');
    if (deviceId) {
      const d = await db().collection(C.devices).doc(deviceId).get();
      if (!d.exists || d.get('status') === 'revoked') throw new HttpsError('not-found', 'That phone is not set up');
    }
    const patch = storeId === '*' ? {sms: {defaultSenderDeviceId: deviceId}} : {sms: {senderDeviceByStore: {[storeId]: deviceId}}};
    await db().collection('mp_settings').doc('sales').set({...patch, updatedAt: Date.now()}, {merge: true});
    logger.info('texting phone set', {storeId, deviceId, by: req.auth.uid, city: storeCity(storeId)});
    return {ok: true};
  }
  throw new HttpsError('invalid-argument', 'Unknown action');
});
