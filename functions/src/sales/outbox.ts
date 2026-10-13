// "Sell more" release — the one way every feature sends a text: queueSms() writes mp_sms/{id} (status 'queued').
// The texting track (texting.ts) delivers it: from the store's texting phone (TIGON IOT app) or Twilio.
// Opted-out numbers (replied STOP) are never texted; automatic texts wait until quiet hours end.
// TCPA: automatic MARKETING texts (MARKETING_KINDS) go out only with written consent on file — the lead's
// smsConsent === true or the customer's consentSms === true. Texts the customer asked for (a reply, their booking's
// reminders, the one missed-call text-back) don't need it.
// `queueAt` (ms) is present only while a text is 'queued' — the texting phone / housekeeping query it (bounded reads).
import {FieldValue} from 'firebase-admin/firestore';
import {C, afterQuiet, db, e164} from './util';
import {loadSalesSettings} from './settings';

export type SmsKind =
  | 'manual' | 'auto_lead' | 'missed_call' | 'cadence' | 'price_drop' | 'similar' | 'appointment' | 'no_show'
  | 'quote' | 'prequal' | 'trade_in' | 'referral' | 'service' | 'reply';

export interface SmsInput {
  to: string;
  body: string;
  kind: SmsKind;
  /** Which store's number sends it (decides the texting phone / Twilio number). */
  storeId?: string;
  leadId?: string;
  customerId?: string;
  appointmentId?: string;
  /** uid of the person who sent it ('' = automatic). */
  createdBy?: string;
  /** Don't send before this time (ms). Automatic texts are also pushed past quiet hours. */
  sendAt?: number;
  /** Same key twice → one text (e.g. `cadence_<leadId>_<step>`). */
  dedupeKey?: string;
}

/** mp_sms document shape. */
export interface SmsDoc {
  to: string;
  body: string;
  kind: SmsKind;
  storeId: string;
  leadId?: string;
  customerId?: string;
  appointmentId?: string;
  createdBy: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';
  provider?: 'phone' | 'twilio';
  /** Texting phone that took it (provider 'phone'). */
  deviceId?: string;
  sendAt: number;
  attempts: number;
  error?: string;
  createdAt: number;
  sentAt?: number;
  /** Twilio message SID. */
  sid?: string;
  /** Owner of the lead (lets the salesperson see automatic texts to their lead). */
  ownerUid?: string;
  /** When the texting phone / Twilio picked it up (stuck-text recovery). */
  takenAt?: number;
  /** = sendAt while status is 'queued'; deleted once taken/sent/failed/skipped. */
  queueAt?: number;
}

/** Automatic marketing texts: sent only when the person agreed to texts. */
export const MARKETING_KINDS: SmsKind[] = ['auto_lead', 'cadence', 'price_drop', 'similar', 'no_show', 'referral', 'service'];
export const isMarketingKind = (k: string) => (MARKETING_KINDS as string[]).includes(k);

/** Written consent on file for this lead / customer (smsConsent === true / consentSms === true). */
export async function hasMarketingConsent(leadId?: string, customerId?: string): Promise<boolean> {
  try {
    if (leadId) {
      const l = await db().collection(C.leads).doc(leadId).get();
      if (l.get('smsConsent') === true) return true;
      const cust = customerId || String(l.get('customerId') || '');
      if (cust && (await db().collection(C.customers).doc(cust).get()).get('consentSms') === true) return true;
      return false;
    }
    if (customerId) return (await db().collection(C.customers).doc(customerId).get()).get('consentSms') === true;
  } catch {
    // unknown → no consent
  }
  return false;
}

/** Automatic first-contact texts carry the opt-out notice. */
export const OPT_OUT_NOTICE = 'Reply STOP to opt out.';
const NOTICE_KINDS: SmsKind[] = ['auto_lead', 'missed_call'];
export function withOptOutNotice(kind: SmsKind, body: string): string {
  if (!NOTICE_KINDS.includes(kind) || /\bSTOP\b/.test(body)) return body;
  return `${body.replace(/\s+$/, '')} ${OPT_OUT_NOTICE}`;
}

/** Lead owner for a text (so the salesperson can read it). */
async function leadOwner(leadId?: string): Promise<string> {
  if (!leadId) return '';
  try {
    return String((await db().collection(C.leads).doc(leadId).get()).get('ownerUid') || '');
  } catch {
    return '';
  }
}

export const isOptedOut = async (to: string) => (await db().collection(C.smsOptOut).doc(to).get()).exists;

/** Queues a text. Returns the mp_sms id, or null when it can't/shouldn't be sent (bad number, opted out, duplicate). */
export async function queueSms(input: SmsInput): Promise<string | null> {
  const to = e164(input.to);
  const raw = String(input.body || '').trim().slice(0, 1170);
  if (!to || !raw) return null;
  const body = withOptOutNotice(input.kind, raw);
  if (await isOptedOut(to)) return null;
  // Automatic (createdBy '') marketing texts need consent; a person pressing Send is not automatic.
  if (!input.createdBy && isMarketingKind(input.kind) && !(await hasMarketingConsent(input.leadId, input.customerId))) return null;
  const now = Date.now();
  let sendAt = Math.max(input.sendAt || now, now);
  if (input.kind !== 'manual' && input.kind !== 'reply') {
    const s = await loadSalesSettings();
    sendAt = afterQuiet(sendAt, s.sms.quietStart, s.sms.quietEnd);
  }
  const ownerUid = await leadOwner(input.leadId);
  const doc: SmsDoc = {
    to, body, kind: input.kind, storeId: input.storeId || '', createdBy: input.createdBy || '',
    status: 'queued', sendAt, queueAt: sendAt, attempts: 0, createdAt: now,
    ...(ownerUid ? {ownerUid} : {}),
    ...(input.leadId ? {leadId: input.leadId} : {}),
    ...(input.customerId ? {customerId: input.customerId} : {}),
    ...(input.appointmentId ? {appointmentId: input.appointmentId} : {}),
  };
  const col = db().collection(C.sms);
  if (input.dedupeKey) {
    const ref = col.doc(`k_${input.dedupeKey.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 140)}`);
    try {
      await ref.create(doc);
      return ref.id;
    } catch {
      return null; // already queued once
    }
  }
  const ref = await col.add(doc);
  return ref.id;
}

/** Marks a lead as contacted by text (first response time, New → Talking). */
export async function markLeadTexted(leadId: string | undefined, at = Date.now()) {
  if (!leadId) return;
  const ref = db().collection(C.leads).doc(leadId);
  await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return;
    const patch: Record<string, unknown> = {lastContactAt: at, updatedAt: at};
    if (!s.get('firstResponseAt')) patch.firstResponseAt = at;
    if (s.get('status') === 'new') patch.status = 'talking';
    tx.update(ref, patch);
  });
}

export const serverTime = () => FieldValue.serverTimestamp();
