// Growth release — Team & admin.
//   mpApprovalDigest : every 30 min, one IoT notification per manager when new posts wait for approval
//   mpBackup         : nightly Firestore export to Cloud Storage (gs://<BACKUP_BUCKET>/backups/<date>)
//   mpBackupNow      : same export on demand (admins, from the Status page)
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

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
export const mpApprovalDigest = onSchedule({schedule: 'every 30 minutes', timeZone: TZ}, async () => {
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
    batch.set(db().collection('notifications').doc(), {
      targetUserId: m.id,
      sourceDeviceName: 'MP Assistant',
      text,
      isHandled: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
    const record = {ok: true, trigger, startedAt, operation: operation.name || '', outputUriPrefix, error: ''};
    await ref.set(record);
    logger.info('Firestore export started', record);
    return record;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('Firestore export failed', err);
    const record = {ok: false, trigger, startedAt, operation: '', outputUriPrefix, error};
    await ref.set(record);
    return record;
  }
}

/** Nightly Firestore export at 3am New York time. */
export const mpBackup = onSchedule({schedule: 'every day 03:00', timeZone: TZ}, async () => {
  await runBackup('schedule');
});

/** "Back up now" button on the Status page (admins). */
export const mpBackupNow = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const caller = (await db().collection(USERS).doc(req.auth.uid).get()).data() as Json | undefined;
  if (caller?.role !== 'admin') throw new HttpsError('permission-denied', 'Only admins can start a backup');
  const record = await runBackup('manual');
  await db().collection(AUDIT).add({
    actorUid: req.auth.uid, actorName: String(caller.name || caller.email || req.auth.uid),
    action: 'backup.run', target: 'firestore', details: record.ok ? record.outputUriPrefix : `failed: ${record.error}`,
    ts: Date.now(),
  });
  if (!record.ok) throw new HttpsError('internal', `Backup failed: ${record.error}`);
  return record;
});
