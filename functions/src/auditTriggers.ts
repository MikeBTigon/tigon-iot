// Server-side audit trail (mp_audit; clients can no longer create audit entries):
//   mpAuditUsers    mp_users/{uid}         role / location / status changes (and new / removed members)
//   mpAuditSettings mp_settings/{id}       any settings change (which keys changed)
//   mpAuditOptOut   mp_sms_optout/{phone}  a number opted out of / back into texts
//   mpAuditWhSettings wh_settings/{id}     Webhook Flows settings (not the server's own status/state docs)
// A trigger doesn't know who made the change: the entry records the before/after of what changed, and the doc's own
// updatedBy/by field when it has one.
//   mpUserPending   mp_users created with status 'pending' → every admin gets "X wants to join" (approve in Accounts).
import * as logger from 'firebase-functions/logger';
import {onDocumentCreated, onDocumentWritten} from 'firebase-functions/v2/firestore';
import type {Change, FirestoreEvent} from 'firebase-functions/v2/firestore';
import type {DocumentSnapshot} from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import {notify} from './sales/util';
import {isInactiveStatus} from './membership';

type Json = Record<string, unknown>;
const db = () => admin.firestore();
const NOISE = new Set(['updatedAt', 'lastLogin', 'lastSeen', 'lastActiveAt', 'savedAt']);

const show = (v: unknown): string => {
  if (v === undefined) return '(none)';
  if (v && typeof v === 'object' && typeof (v as {toMillis?: () => number}).toMillis === 'function') {
    return new Date((v as {toMillis: () => number}).toMillis()).toISOString();
  }
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return (s ?? '').length > 120 ? `${s.slice(0, 117)}…` : s ?? '';
};

/** Top-level keys whose value changed (noise keys ignored). */
export function changedKeys(before: Json | undefined, after: Json | undefined, only?: string[]): string[] {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((k) => !NOISE.has(k) && (!only || only.includes(k)) &&
    JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null)).sort();
}

async function write(action: string, target: string, before: Json | undefined, after: Json | undefined, keys: string[]) {
  const actorUid = String(after?.updatedBy || after?.by || '');
  const diff = Object.fromEntries(keys.slice(0, 40).map((k) => [k, {before: show(before?.[k]), after: show(after?.[k])}]));
  await db().collection('mp_audit').add({
    actorUid, actorName: actorUid ? '' : '(recorded by the server)', action, target,
    details: keys.slice(0, 40).map((k) => `${k}: ${show(before?.[k])} → ${show(after?.[k])}`).join('; ').slice(0, 1500),
    changedKeys: keys.slice(0, 40), diff, source: 'trigger', ts: Date.now(),
  });
}

type Ev = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;
const datas = (e: Ev) => ({before: e.data?.before.data() as Json | undefined, after: e.data?.after.data() as Json | undefined});

export const mpAuditUsers = onDocumentWritten('mp_users/{uid}', async (e) => {
  const {before, after} = datas(e as Ev);
  const keys = !before || !after ? changedKeys(before, after, ['role', 'location', 'status', 'email', 'name']) :
    changedKeys(before, after, ['role', 'location', 'status']);
  if (!keys.length) return;
  const action = !before ? 'user.created' : !after ? 'user.removed' : 'user.changed';
  await write(action, `mp_users/${e.params.uid}`, before, after, keys).catch((err) => logger.error('audit users', err));
});

export const mpAuditSettings = onDocumentWritten('mp_settings/{id}', async (e) => {
  const {before, after} = datas(e as Ev);
  const keys = changedKeys(before, after);
  if (keys.length) await write('settings.changed', `mp_settings/${e.params.id}`, before, after, keys).catch((err) => logger.error('audit settings', err));
});

export const mpAuditOptOut = onDocumentWritten('mp_sms_optout/{phone}', async (e) => {
  const {before, after} = datas(e as Ev);
  if (!!before === !!after) return;
  await write(after ? 'sms.optout' : 'sms.optin', `mp_sms_optout/${e.params.phone}`, before, after,
    changedKeys(before, after, ['phone', 'via', 'word', 'leadId', 'by'])).catch((err) => logger.error('audit optout', err));
});

/** Server-maintained docs in wh_settings (status, counters, markers) — not settings people change. */
const WH_SERVER_DOCS = /(_state|_status)$|^migrations$/;

export const mpAuditWhSettings = onDocumentWritten('wh_settings/{id}', async (e) => {
  if (WH_SERVER_DOCS.test(e.params.id)) return;
  const {before, after} = datas(e as Ev);
  const keys = changedKeys(before, after);
  if (keys.length) await write('wh_settings.changed', `wh_settings/${e.params.id}`, before, after, keys).catch((err) => logger.error('audit wh', err));
});

/** Someone signed up and waits for approval → tell every active admin. */
export const mpUserPending = onDocumentCreated('mp_users/{uid}', async (e) => {
  const u = e.data?.data() as Json | undefined;
  if (!u || u.status !== 'pending') return;
  const name = String(u.name || '').trim() || 'Someone';
  const email = String(u.email || '').trim();
  const admins = await db().collection('mp_users').where('role', '==', 'admin').get();
  const text = `${name}${email ? ` (${email})` : ''} wants to join TIGON IOT — approve them in MP Assistant → Accounts.`;
  for (const a of admins.docs) {
    if (isInactiveStatus(a.get('status'))) continue;
    await notify(a.id, 'TIGON IOT', text, {source: 'mp_signup', userId: e.params.uid, url: '/mp/accounts'}, `signup_${e.params.uid}_${a.id}`);
  }
});
