// Growth release — Team & admin.
//   mpApprovalDigest : every 30 min, one IoT notification per manager when new posts wait for approval
//   mpBackup         : nightly Firestore export to Cloud Storage (gs://<BACKUP_BUCKET>/backups/<date>)
//   mpBackupNow      : same export on demand (admins, from the Status page)
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {FieldValue} from 'firebase-admin/firestore';
import {notificationExpireAt} from './sales/util';
import {GoogleAuth} from 'google-auth-library';
import {raiseSystemAlert} from './alerts';

type Json = Record<string, any>;

const USERS = 'mp_users';
const QUEUE = 'mp_queue';
const AUDIT = 'mp_audit';
const TZ = 'America/New_York';

const db = () => admin.firestore();

// ---------------------------------------------------------------------------
// Approval digest
// ---------------------------------------------------------------------------

/**
 * Every 30 minutes: if Members queued posts that need approval since the last notice, drop one IoT
 * notification per manager/admin (→ phone push via onNotificationCreate). Tracks mp_meta/approvals.lastNotifiedAt.
 */
export const mpApprovalDigest = onSchedule({schedule: 'every 30 minutes', timeZone: TZ, timeoutSeconds: 300}, async () => {
  const metaRef = db().doc('mp_meta/approvals');
  const lastNotifiedAt = Number((await metaRef.get()).get('lastNotifiedAt') || 0);
  const pending = await db().collection(QUEUE).where('status', '==', 'pending_approval').get();
  const fresh = pending.docs.filter((d) => Number(d.get('createdAt') || d.get('updatedAt') || 0) > lastNotifiedAt);
  if (!fresh.length) return;

  const now = Date.now();
  const titles = fresh.slice(0, 3).map((d) => String(d.get('cartTitle') || 'a cart'));
  const more = fresh.length > 3 ? ` and ${fresh.length - 3} more` : '';
  const text = `${fresh.length} new post${fresh.length === 1 ? '' : 's'} waiting for your approval ` +
    `(${pending.size} in total): ${titles.join(', ')}${more}. Open MP Assistant → Queue → Needs approval.`;

  const managers = await db().collection(USERS).where('role', 'in', ['admin', 'manager']).get();
  const batch = db().batch();
  for (const m of managers.docs) {
    if (m.get('status') === 'pending' || m.get('status') === 'disabled') continue;
    batch.set(db().collection('notifications').doc(), {
      targetUserId: m.id,
      sourceDeviceName: 'MP Assistant',
      text,
      isHandled: false,
      createdAt: FieldValue.serverTimestamp(),
      expireAt: notificationExpireAt(),
      source: 'mp_approval',
    });
  }
  batch.set(metaRef, {lastNotifiedAt: now, lastCount: fresh.length, pending: pending.size}, {merge: true});
  await batch.commit();
  logger.info('Approval digest sent', {fresh: fresh.length, managers: managers.size});
});

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

function projectId(): string {
  const fromEnv = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (fromEnv) return fromEnv;
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || admin.app().options.projectId || '';
  } catch {
    return admin.app().options.projectId || '';
  }
}

/** YYYY-MM-DD in New York time. */
const nyDate = (d = new Date()) => d.toLocaleDateString('en-CA', {timeZone: TZ});

/**
 * Starts a full Firestore export (all collections) and records it in mp_meta/backup.
 * The export itself runs in the background on Google's side; `operation` is its long-running operation name.
 */
async function runBackup(trigger: string): Promise<Json> {
  const project = projectId();
  const bucket = (process.env.BACKUP_BUCKET || `${project}-backups`).replace(/^gs:\/\//, '').replace(/\/+$/, '');
  const suffix = trigger === 'schedule' ? '' : `-${trigger}-${Date.now()}`;
  const outputUriPrefix = `gs://${bucket}/backups/${nyDate()}${suffix}`;
  const startedAt = Date.now();
  const ref = db().doc('mp_meta/backup');
  try {
    const client = new admin.firestore.v1.FirestoreAdminClient();
    const [operation] = await client.exportDocuments({
      name: client.databasePath(project, '(default)'),
      outputUriPrefix,
      collectionIds: [], // empty = every collection
    });
    // The export runs on Google's side; checkBackup() (mpHealth) polls `operation` until it is done.
    const record = {ok: true, trigger, startedAt, operation: operation.name || '', outputUriPrefix, error: '', bucket, done: false};
    await ref.set(record);
    logger.info('Firestore export started', record);
    return record;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('Firestore export failed', err);
    const record = {ok: false, trigger, startedAt, operation: '', outputUriPrefix, error, bucket, done: true};
    await ref.set(record);
    await raiseSystemAlert({key: 'backup_failed', title: 'Nightly backup failed', text: `The Firestore backup could not start: ${error}`.slice(0, 600)});
    return record;
  }
}

/** Nightly Firestore export at 3am New York time; then backups older than 30 days are deleted. */
export const mpBackup = onSchedule({schedule: 'every day 03:00', timeZone: TZ, timeoutSeconds: 540}, async () => {
  const r = await runBackup('schedule');
  try {
    const removed = await pruneBackups(String(r.bucket || ''), BACKUP_KEEP_DAYS);
    if (removed.length) logger.info('old backups deleted', removed);
  } catch (e) {
    logger.error('backup retention failed', e);
    await raiseSystemAlert({key: 'backup_retention', title: 'Old backups not cleaned up', severity: 'warning',
      text: `Old backups could not be deleted: ${e instanceof Error ? e.message : String(e)}`.slice(0, 600)});
  }
});

export const BACKUP_KEEP_DAYS = 30;

/** Date of a backup folder name ("backups/2026-10-13" or "backups/2026-10-13-manual-…/") in ms, or 0. */
export function backupFolderDate(prefix: string): number {
  const m = /backups\/(\d{4}-\d{2}-\d{2})/.exec(prefix);
  return m ? Date.parse(`${m[1]}T12:00:00Z`) || 0 : 0;
}

/** Deletes export folders (backups/<date>…/) older than `keepDays`. Returns the deleted prefixes. */
export async function pruneBackups(bucketName: string, keepDays: number, now = Date.now()): Promise<string[]> {
  if (!bucketName) return [];
  const bucket = admin.storage().bucket(bucketName);
  const prefixes: string[] = [];
  let pageToken: string | undefined;
  do {
    const [, next, api] = await bucket.getFiles({prefix: 'backups/', delimiter: '/', autoPaginate: false, maxResults: 1000, pageToken});
    prefixes.push(...(((api as {prefixes?: string[]})?.prefixes) || []));
    pageToken = (next as {pageToken?: string} | null)?.pageToken;
  } while (pageToken);
  const cutoff = now - keepDays * 24 * 3600_000;
  const old = prefixes.filter((p) => {
    const t = backupFolderDate(p);
    return t > 0 && t < cutoff;
  });
  for (const p of old) await bucket.deleteFiles({prefix: p.endsWith('/') ? p : `${p}/`});
  return old;
}

/**
 * Polls the export started by runBackup (Firestore Admin REST: GET v1/{operation}) and records done/error in
 * mp_meta/backup. Alerts when it failed or isn't done 6 hours after it started. Returns a health line.
 */
export async function checkBackup(now = Date.now(), fetcher: typeof fetch = fetch): Promise<{ok: boolean; detail: string}> {
  const ref = db().doc('mp_meta/backup');
  const b = (await ref.get()).data() as Json | undefined;
  if (!b) return {ok: false, detail: 'No backup has run yet'};
  const startedAt = Number(b.startedAt || 0);
  if (b.ok === false) return {ok: false, detail: `Last backup failed to start: ${b.error || 'unknown error'}`};
  if (now - startedAt > 30 * 3600_000) {
    await raiseSystemAlert({key: 'backup_missing', title: 'No recent backup', text: `The last Firestore backup started ${Math.round((now - startedAt) / 3600_000)} hours ago.`});
    return {ok: false, detail: 'No backup in the last 30 hours'};
  }
  if (b.done === true) {
    return b.opError ? {ok: false, detail: `Last backup failed: ${b.opError}`} : {ok: true, detail: `Last backup finished ${new Date(Number(b.doneAt || startedAt)).toISOString()}`};
  }
  if (!b.operation) return {ok: true, detail: 'Backup started (no operation to check)'};
  let done = false;
  let opError = '';
  try {
    const auth = new GoogleAuth({scopes: ['https://www.googleapis.com/auth/datastore']});
    const token = await auth.getAccessToken();
    const r = await fetcher(`https://firestore.googleapis.com/v1/${b.operation}`, {
      headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => ({}))) as Json;
    if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
    done = j.done === true;
    if (j.error) opError = String(j.error.message || JSON.stringify(j.error)).slice(0, 300);
    const state = String(j.metadata?.operationState || '');
    if (done || opError) {
      await ref.set({done: true, doneAt: now, state, ...(opError ? {opError} : {})}, {merge: true});
    } else {
      await ref.set({state, checkedAt: now}, {merge: true});
    }
  } catch (e) {
    return {ok: true, detail: `Backup running (could not check: ${e instanceof Error ? e.message : String(e)})`};
  }
  if (opError) {
    await raiseSystemAlert({key: 'backup_failed', title: 'Nightly backup failed', text: `The Firestore backup failed: ${opError}`});
    return {ok: false, detail: `Backup failed: ${opError}`};
  }
  if (!done && now - startedAt > 6 * 3600_000) {
    await raiseSystemAlert({key: 'backup_unfinished', title: 'Backup not finished', text: 'The nightly Firestore backup is still not finished after 6 hours.'});
    return {ok: false, detail: 'Backup not finished after 6 hours'};
  }
  return {ok: true, detail: done ? 'Backup finished' : 'Backup running'};
}

/** "Back up now" button on the Status page (admins). */
export const mpBackupNow = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const caller = (await db().collection(USERS).doc(req.auth.uid).get()).data() as Json | undefined;
  if (caller?.role !== 'admin' || caller.status === 'pending' || caller.status === 'disabled') throw new HttpsError('permission-denied', 'Only admins can start a backup');
  const record = await runBackup('manual');
  await db().collection(AUDIT).add({
    actorUid: req.auth.uid, actorName: String(caller.name || caller.email || req.auth.uid),
    action: 'backup.run', target: 'firestore', details: record.ok ? record.outputUriPrefix : `failed: ${record.error}`,
    ts: Date.now(),
  });
  if (!record.ok) throw new HttpsError('internal', `Backup failed: ${record.error}`);
  return record;
});
