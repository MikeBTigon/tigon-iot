// Webhook Flows — admin API (callables): whReplay, whTestWebhook.
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import type {CallableRequest} from 'firebase-functions/v2/https';
import {LEAD_FIELDS, TRACKING_FIELDS, WH} from './types';
import {SAMPLE_LEAD} from './shared';
import {clearConfigCache, db, loadWebhook} from './config';
import {FINISHED_STATUSES, processSubmission, runSingleStep} from './engine';
import {cleanValue, dedupeKeys} from './fields';
import {bumpStats} from './stats';

const del = () => admin.firestore.FieldValue.delete();

export interface Caller {uid: string; name: string; role: string}

/** Signed-in @tigongolfcarts.com user with role admin or manager (mp_users). */
export async function requireManager(req: CallableRequest, adminOnly = false): Promise<Caller> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const email = String(req.auth.token.email || '').toLowerCase();
  if (!email.endsWith('@tigongolfcarts.com')) throw new HttpsError('permission-denied', 'Only @tigongolfcarts.com accounts can do this.');
  const snap = await db().collection('mp_users').doc(req.auth.uid).get();
  const role = String(snap.get('role') || '');
  if (adminOnly ? role !== 'admin' : role !== 'admin' && role !== 'manager') {
    throw new HttpsError('permission-denied', adminOnly ? 'Only admins can do this.' : 'Only managers and admins can do this.');
  }
  return {uid: req.auth.uid, name: String(snap.get('name') || email), role};
}

async function audit(caller: Caller, action: string, target: string, details = '') {
  await db().collection('mp_audit').add({actorUid: caller.uid, actorName: caller.name, action, target, details, ts: Date.now()})
    .catch((e) => logger.warn('wh audit failed', e));
}

export type ReplayMode = 'failed' | 'all' | 'step';

/**
 * Reset a submission so the engine runs it again.
 * - 'failed': delete dead/failed/retrying step runs; steps that already succeeded are skipped (idempotent).
 * - 'all': delete every step run and run everything again (emails are sent again).
 * Returns the number of step runs deleted, or -1 when the submission doesn't exist.
 */
export async function resetForReplay(id: string, mode: 'failed' | 'all'): Promise<number> {
  const ref = db().collection(WH.submissions).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return -1;
  const runs = await db().collection(WH.stepRuns).where('submissionId', '==', id).limit(500).get();
  const batch = db().batch();
  let deleted = 0;
  for (const r of runs.docs) {
    if (mode === 'all' || ['dead', 'failed', 'retrying'].includes(String(r.get('status')))) {
      batch.delete(r.ref);
      deleted++;
    }
  }
  const upd: Record<string, unknown> = {
    status: 'queued', cursor: {flow: 'webhook', index: 0}, nextRunAt: Date.now(), leaseUntil: del(),
    processedAt: del(), hasDead: false, stepsFailed: 0, error: del(), lastError: del(),
    // A manager replaying a spam/duplicate submission wants it processed.
    isSpam: false, spamReason: del(),
  };
  if (mode === 'all') Object.assign(upd, {stepsOk: 0, isDuplicate: false, duplicateOf: del()});
  batch.update(ref, upd);
  await batch.commit();
  return deleted;
}

export const whReplay = onCall({timeoutSeconds: 120, memory: '512MiB'}, async (req) => {
  const caller = await requireManager(req);
  const d = (req.data || {}) as Record<string, unknown>;
  const mode = (String(d.mode || 'failed')) as ReplayMode;
  if (!['failed', 'all', 'step'].includes(mode)) throw new HttpsError('invalid-argument', 'Unknown replay mode.');
  clearConfigCache(); // pick up flow fixes made just before the replay

  // Bulk (dead-letter page): queue only; whProcess runs them within a minute.
  if (Array.isArray(d.submissionIds)) {
    if (mode === 'step') throw new HttpsError('invalid-argument', 'Bulk replay supports "failed" or "all".');
    const ids = Array.from(new Set(d.submissionIds.map(String).filter(Boolean)));
    if (ids.length > 200) throw new HttpsError('invalid-argument', 'Replay at most 200 submissions at a time.');
    let queued = 0;
    let missing = 0;
    let runsDeleted = 0;
    for (let i = 0; i < ids.length; i += 20) {
      const res = await Promise.all(ids.slice(i, i + 20).map((id) => resetForReplay(id, mode as 'failed' | 'all')));
      for (const n of res) {
        if (n < 0) missing++;
        else {
          queued++;
          runsDeleted += n;
        }
      }
    }
    await audit(caller, 'wh_replay', `${queued} submissions`, `mode=${mode}; ${ids.slice(0, 20).join(',')}${ids.length > 20 ? '…' : ''}`);
    return {queued, missing, runsDeleted};
  }

  const id = String(d.submissionId || '');
  if (!id) throw new HttpsError('invalid-argument', 'Missing submissionId.');
  if (mode === 'step') {
    const stepId = String(d.stepId || '');
    const flowKind = d.flowKind === 'master' ? 'master' : 'webhook';
    if (!stepId) throw new HttpsError('invalid-argument', 'Missing stepId.');
    const r = await runSingleStep(id, flowKind, stepId);
    if (r.status === 'missing') throw new HttpsError('not-found', r.error || 'Submission not found.');
    await audit(caller, 'wh_replay', id, `mode=step; ${flowKind}/${stepId} → ${r.status}`);
    return {queued: 0, ran: 1, stepStatus: r.status, error: r.error || null};
  }
  const deleted = await resetForReplay(id, mode);
  if (deleted < 0) throw new HttpsError('not-found', 'Submission not found.');
  const r = await processSubmission(id, {force: true, deadline: Date.now() + 90_000});
  await audit(caller, 'wh_replay', id, `mode=${mode}; runs reset=${deleted}; status=${r.status}`);
  return {queued: 1, runsDeleted: deleted, ran: r.ran, status: r.status};
});

/** Build the fields of a test submission (SAMPLE_LEAD + overrides). Exported for tests. */
export function testFields(formName: string, sample?: Record<string, unknown>): Record<string, string> {
  const std = new Set<string>([...LEAD_FIELDS, ...TRACKING_FIELDS]);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(SAMPLE_LEAD)) if (std.has(k) && v) out[k] = v;
  for (const [k, v] of Object.entries(sample || {})) {
    const s = cleanValue(v);
    if (std.has(k) && k !== 'user_ip') {
      if (s) out[k] = s;
      else delete out[k];
    }
  }
  out.form_name = formName || out.form_name || 'Test';
  out.user_ip = '0.0.0.0';
  return out;
}

/** Create a test submission for a webhook and run it now. Exported for tests. */
export async function createTestSubmission(webhookId: string, sample?: Record<string, unknown>, actor?: Caller) {
  const webhook = await loadWebhook(webhookId, true);
  if (!webhook) throw new HttpsError('not-found', 'Webhook not found.');
  const fields = testFields(webhook.formName, sample);
  const ref = db().collection(WH.submissions).doc();
  const now = Date.now();
  await ref.set({
    ...fields,
    id: ref.id,
    webhookId: webhook.id,
    domainId: webhook.domainId || '',
    flowId: webhook.flowId || '',
    status: 'queued',
    isDuplicate: false,
    isSpam: false,
    isTest: true,
    rawPayload: {test: true, fields, extra: {}, files: [], sentBy: actor?.name || ''},
    receivedAt: now,
    cursor: {flow: 'webhook', index: 0},
    nextRunAt: now,
    dedupeKeys: dedupeKeys(fields),
  });
  const r = await processSubmission(ref.id, {force: true, deadline: Date.now() + 90_000});
  return {submissionId: ref.id, status: r.status, finished: FINISHED_STATUSES.includes(r.status)};
}

export const whTestWebhook = onCall({timeoutSeconds: 120, memory: '512MiB'}, async (req) => {
  const caller = await requireManager(req);
  const d = (req.data || {}) as Record<string, unknown>;
  const webhookId = String(d.webhookId || '');
  if (!webhookId) throw new HttpsError('invalid-argument', 'Missing webhookId.');
  clearConfigCache();
  const sample = d.sample && typeof d.sample === 'object' ? (d.sample as Record<string, unknown>) : undefined;
  const r = await createTestSubmission(webhookId, sample, caller);
  await audit(caller, 'wh_test_webhook', webhookId, `submission=${r.submissionId}; status=${r.status}`);
  return r;
});

/** Delete one submission with its step runs, unsent Sheets rows and uploaded images. false = not found. */
export async function deleteSubmission(id: string): Promise<boolean> {
  const ref = db().collection(WH.submissions).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  let failedSteps = 0;
  for (const coll of [WH.stepRuns, WH.sheetBuffer]) {
    for (;;) {
      const rs = await db().collection(coll).where('submissionId', '==', id).limit(400).get();
      if (rs.empty) break;
      const batch = db().batch();
      rs.docs.forEach((r) => {
        if (coll === WH.stepRuns && ['failed', 'dead'].includes(String(r.get('status')))) failedSteps++;
        batch.delete(r.ref);
      });
      await batch.commit();
      if (rs.size < 400) break;
    }
  }
  await ref.delete();
  // Take the lead out of the daily counters too, so the overview numbers match what is left.
  const sub = snap.data() || {};
  const isSpam = !!sub.isSpam || sub.status === 'spam';
  const isTest = sub.isTest === true;
  await bumpStats({
    total: -1,
    ...(isSpam ? {spam: -1} : {domainId: String(sub.domainId || ''), webhookId: String(sub.webhookId || ''), source: String(sub.utm_source || 'direct'), mapDelta: -1}),
    ...(!isTest && sub.status === 'duplicate' ? {duplicate: -1} : {}),
    ...(!isTest && failedSteps ? {failedSteps: -failedSteps} : {}),
  }, Number(sub.receivedAt) || Date.now());
  await admin.storage().bucket().deleteFiles({prefix: `wh_uploads/${snap.get('webhookId')}/${id}/`})
    .catch((e) => logger.warn('wh delete: file delete failed', id, e));
  return true;
}

/**
 * whDeleteSubmissions (manager): {submissionIds: string[]} (max 500) → permanently deletes the leads, their
 * step history, pending Sheets rows and uploaded images. CRM leads (MP Leads), sent emails and rows already
 * written to Google Sheets / the DMS are not touched.
 */
export const whDeleteSubmissions = onCall({timeoutSeconds: 300, memory: '512MiB'}, async (req) => {
  const caller = await requireManager(req);
  const d = (req.data || {}) as Record<string, unknown>;
  const raw = Array.isArray(d.submissionIds) ? d.submissionIds : d.submissionId ? [d.submissionId] : [];
  const ids = Array.from(new Set(raw.map(String).filter(Boolean)));
  if (!ids.length) throw new HttpsError('invalid-argument', 'Choose at least one submission.');
  if (ids.length > 500) throw new HttpsError('invalid-argument', 'Delete at most 500 submissions at a time.');
  let deleted = 0;
  let missing = 0;
  for (let i = 0; i < ids.length; i += 10) {
    const res = await Promise.all(ids.slice(i, i + 10).map((id) => deleteSubmission(id)));
    res.forEach((ok) => (ok ? deleted++ : missing++));
  }
  await audit(caller, 'wh_delete_submissions', `${deleted} submissions`, `${ids.slice(0, 20).join(',')}${ids.length > 20 ? '…' : ''}`);
  return {deleted, missing};
});
