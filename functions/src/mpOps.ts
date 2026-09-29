// Tigon MP Assistant — phones, posting queue and alerts.
//   mpCreatePairingCode / mpPairDevice : QR / code pairing of a phone to a user
//   mpSendQueueItem / mpDispatchQueue  : push "ready to post" to the assigned phone, with retries
//   mpMonitor                          : alerts for offline phones, failed posts and failed DMS syncs
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {createHash, randomBytes, randomInt} from 'crypto';

const USERS = 'mp_users';
const QUEUE = 'mp_queue';
const PAIRING = 'mp_pairing';
const ALERTS = 'mp_alerts';
const AUDIT = 'mp_audit';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RESEND_AFTER_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const GIVE_UP_AFTER_MS = 60 * 60 * 1000;
const OFFLINE_ALERT_MS = 24 * 60 * 60 * 1000;

type Json = Record<string, any>;

const db = () => admin.firestore();
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

async function mpProfile(uid: string): Promise<Json | null> {
  const snap = await db().collection(USERS).doc(uid).get();
  return snap.exists ? (snap.data() as Json) : null;
}

const isManagerRole = (role: unknown) => role === 'admin' || role === 'manager';

async function audit(actorUid: string, actorName: string, action: string, target: string, details = '') {
  await db().collection(AUDIT).add({actorUid, actorName, action, target, details, ts: Date.now()});
}

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

/** Creates a one-time pairing code (10 minutes) for yourself, or — managers — for a teammate. */
export const mpCreatePairingCode = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const caller = await mpProfile(req.auth.uid);
  if (!caller) throw new HttpsError('permission-denied', 'Set up MP Assistant first');
  const forUserId = typeof req.data?.forUserId === 'string' && req.data.forUserId ? req.data.forUserId : req.auth.uid;
  if (forUserId !== req.auth.uid) {
    if (!isManagerRole(caller.role)) throw new HttpsError('permission-denied', 'Only managers can pair phones for others');
    if (!(await mpProfile(forUserId))) throw new HttpsError('not-found', 'That user has no MP profile');
  }

  // Phone setup details chosen on the computer: phone number (#0003), dealership location, Facebook account.
  const d = (req.data || {}) as Json;
  const deviceNumber = String(d.deviceNumber || '').trim().slice(0, 12);
  if (deviceNumber && !/^[A-Za-z0-9-]{1,12}$/.test(deviceNumber)) {
    throw new HttpsError('invalid-argument', 'Phone number: letters, digits and "-" only (e.g. 0003)');
  }
  const locationId = String(d.locationId || '').slice(0, 20);
  const accountId = String(d.accountId || '').slice(0, 128);
  let accountName = '';
  if (accountId) {
    const acc = await db().collection('mp_accounts').doc(accountId).get();
    if (!acc.exists) throw new HttpsError('not-found', 'That Facebook account no longer exists');
    accountName = String(acc.get('name') || '');
  }
  const replaceDeviceId = String(d.replaceDeviceId || '').slice(0, 200);
  if (deviceNumber && !replaceDeviceId) {
    const dup = await db().collection('devices').where('deviceNumber', '==', deviceNumber).limit(5).get();
    const active = dup.docs.find((x) => x.get('status') !== 'revoked');
    if (active) {
      throw new HttpsError('already-exists',
        `Phone #${deviceNumber} is already set up (${active.get('deviceName') || active.id}). Pick another number or replace it.`);
    }
  }

  const token = randomBytes(24).toString('base64url');
  const code = Array.from({length: 8}, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  const expiresAt = Date.now() + PAIRING_TTL_MS;
  await db().collection(PAIRING).doc(sha256(token)).set({
    deviceNumber, locationId, accountId, accountName, replaceDeviceId,
    userId: forUserId,
    codeHash: sha256(code),
    createdBy: req.auth.uid,
    createdAt: Date.now(),
    expiresAt,
    used: false,
  });
  return {token, code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt, qr: `TIGONIOT-PAIR:${token}`};
});

/**
 * Called by the phone app (not signed in yet) with a QR token or typed code.
 * Registers the phone to the user and returns a custom sign-in token.
 */
export const mpPairDevice = onCall(async (req) => {
  const d = (req.data || {}) as Json;
  const installId = String(d.installId || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(installId)) throw new HttpsError('invalid-argument', 'Bad install id');

  let ref: admin.firestore.DocumentReference | null = null;
  const raw = String(d.token || d.code || '').trim();
  const token = raw.replace(/^TIGONIOT-PAIR:/, '');
  if (d.token || raw.startsWith('TIGONIOT-PAIR:')) {
    ref = db().collection(PAIRING).doc(sha256(token));
  } else {
    const code = normalizeCode(raw);
    if (code.length !== 8) throw new HttpsError('invalid-argument', 'Enter the 8-character code');
    const q = await db().collection(PAIRING).where('codeHash', '==', sha256(code)).limit(1).get();
    ref = q.empty ? null : q.docs[0].ref;
  }
  if (!ref) throw new HttpsError('not-found', 'Code not found or expired');

  const pairing = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref!);
    if (!snap.exists) throw new HttpsError('not-found', 'Code not found or expired');
    const p = snap.data() as Json;
    if (p.used) throw new HttpsError('already-exists', 'This code was already used');
    if (p.expiresAt < Date.now()) throw new HttpsError('deadline-exceeded', 'This code expired — make a new one');
    tx.update(ref!, {used: true, usedAt: Date.now(), installId});
    return p;
  });
  const userId = String(pairing.userId);

  const user = await admin.auth().getUser(userId);
  const profile = await mpProfile(userId);
  const platform = ['ios', 'android'].includes(d.platform) ? d.platform : 'android';
  const model = String(d.model || '').slice(0, 60);
  const deviceId = `app_${installId}_${userId}`;
  const deviceNumber = String(pairing.deviceNumber || '');
  const locationId = String(pairing.locationId || '');
  const who = profile?.name || user.email?.split('@')[0] || 'Phone';
  const deviceName = deviceNumber ?
    `#${deviceNumber} · ${who}` :
    `${who} ${platform === 'ios' ? 'iPhone' : 'Android'}${model ? ` · ${model}` : ''}`;
  // Replacing an old phone with the same number: retire the old one.
  if (pairing.replaceDeviceId && pairing.replaceDeviceId !== deviceId) {
    await db().collection('devices').doc(String(pairing.replaceDeviceId))
      .set({status: 'revoked', isActive: false, fcmToken: admin.firestore.FieldValue.delete(), replacedBy: deviceId}, {merge: true})
      .catch((e) => logger.warn('replace device failed', e));
  }
  // The same phone may have been set up before for another person: retire those records.
  const older = await db().collection('devices').where('installId', '==', installId).limit(20).get();
  for (const o of older.docs) {
    if (o.id !== deviceId && o.get('status') !== 'revoked') {
      await o.ref.set({status: 'revoked', isActive: false, fcmToken: admin.firestore.FieldValue.delete(), replacedBy: deviceId}, {merge: true});
    }
  }
  await db().collection('devices').doc(deviceId).set({
    userId,
    deviceName,
    deviceNumber,
    locationId,
    accountId: String(pairing.accountId || ''),
    accountName: String(pairing.accountName || ''),
    deviceType: 'master',
    isActive: false,
    source: 'tigon-iot-app',
    installId,
    platform,
    model,
    osVersion: String(d.osVersion || '').slice(0, 30),
    appVersion: String(d.appVersion || '').slice(0, 30),
    status: 'active',
    pairedAt: Date.now(),
    lastSeen: Date.now(),
  }, {merge: true});

  await audit(userId, profile?.name || user.email || userId, 'device.paired', deviceId,
    `${deviceNumber ? `#${deviceNumber} ` : ''}${locationId} ${platform} ${model}`.trim());

  // Already signed in as that person on this phone → nothing else to do.
  if (req.auth?.uid === userId) return {customToken: '', deviceId, deviceName};
  try {
    const customToken = await admin.auth().createCustomToken(userId);
    return {customToken, deviceId, deviceName};
  } catch (err) {
    logger.error('createCustomToken failed — grant the functions service account "Service Account Token Creator"', err);
    throw new HttpsError('failed-precondition',
      `Phone ${deviceName} was registered, but automatic sign-in is not set up yet. Sign in on this phone as ${user.email} ` +
      '(email and password), then scan the code again.');
  }
});

// ---------------------------------------------------------------------------
// Posting queue
// ---------------------------------------------------------------------------

interface PushTarget {
  token: string;
  ref: admin.firestore.DocumentReference;
  hadError: boolean;
}

async function tokensFor(item: Json): Promise<PushTarget[]> {
  const devices = db().collection('devices');
  const docs = item.deviceId ?
    [await devices.doc(item.deviceId).get()] :
    (await devices.where('userId', '==', item.assignedUserId).where('source', '==', 'tigon-iot-app').get()).docs;
  return docs
    .filter((d) => d.exists && d.get('userId') === item.assignedUserId && d.get('status') !== 'revoked' && d.get('fcmToken'))
    .map((d) => ({token: String(d.get('fcmToken')), ref: d.ref, hadError: !!d.get('pushError')}));
}

/** FCM error codes meaning the phone's push token is dead (app removed / token rotated / garbage). */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Records push-token problems on the device doc ({pushError, pushErrorAt}) so the Status page can list them,
 * and clears the flag once a push to that phone succeeds again. Never throws.
 */
async function recordPushResults(targets: PushTarget[], responses: admin.messaging.SendResponse[]) {
  const now = Date.now();
  await Promise.all(targets.map(async (t, i) => {
    const r = responses[i];
    try {
      if (r?.success) {
        if (t.hadError) await t.ref.update({pushError: admin.firestore.FieldValue.delete(), pushErrorAt: admin.firestore.FieldValue.delete()});
      } else if (r?.error && DEAD_TOKEN_CODES.has(r.error.code)) {
        await t.ref.update({pushError: `${r.error.code}: ${r.error.message}`.slice(0, 300), pushErrorAt: now});
      }
    } catch (err) {
      logger.warn('Could not record push result', t.ref.id, err);
    }
  }));
}

async function dispatch(ref: admin.firestore.DocumentReference, item: Json) {
  const now = Date.now();
  const targets = await tokensFor(item);
  const tokens = targets.map((t) => t.token);
  const update: Json = {attempts: (item.attempts || 0) + 1, updatedAt: now, sentAt: now};
  if (!tokens.length) {
    update.lastError = 'No phone with notifications turned on for this person (it still shows in their queue).';
  } else {
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: item.attempts ? 'Reminder: ready to post' : 'Ready to post',
        body: `${item.cartTitle}${item.accountName ? ` on ${item.accountName}` : ''} — tap to prepare`,
      },
      data: {type: 'mp_queue', queueId: ref.id, cartId: String(item.cartId || '')},
      android: {priority: 'high'},
    });
    // responses[] is in the same order as tokens[].
    await recordPushResults(targets, res.responses);
    if (res.successCount) {
      update.status = 'sent';
      update.lastError = admin.firestore.FieldValue.delete();
    } else {
      update.lastError = res.responses.find((r) => r.error)?.error?.message || 'Push failed';
    }
  }
  await ref.update(update);
}

/** Sends a due queue item right away (called by the app after "Send now"). */
export const mpSendQueueItem = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const id = String(req.data?.id || '');
  if (!id) throw new HttpsError('invalid-argument', 'Missing queue item id');
  const ref = db().collection(QUEUE).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Queue item not found');
  const item = snap.data() as Json;
  const caller = await mpProfile(req.auth.uid);
  const allowed = caller && (isManagerRole(caller.role) || item.createdBy === req.auth.uid || item.assignedUserId === req.auth.uid);
  if (!allowed) throw new HttpsError('permission-denied', 'Not your queue item');
  if (item.status !== 'queued' || (item.scheduledAt || 0) > Date.now() + 60_000) return {sent: false};
  await dispatch(ref, item);
  return {sent: true};
});

/** Every 5 minutes: send scheduled items, resend unopened ones, give up after 3 tries. */
export const mpDispatchQueue = onSchedule({schedule: 'every 5 minutes', timeZone: 'America/New_York'}, async () => {
  const now = Date.now();
  const open = await db().collection(QUEUE).where('status', 'in', ['queued', 'sent']).get();
  for (const doc of open.docs) {
    const item = doc.data() as Json;
    const attempts = item.attempts || 0;
    if ((item.scheduledAt || 0) > now) continue;
    const lastTry = item.sentAt || 0;
    if (attempts >= MAX_ATTEMPTS) {
      if (now - lastTry > GIVE_UP_AFTER_MS) {
        await doc.ref.update({
          status: 'failed', updatedAt: now,
          lastError: item.lastError || `Not opened after ${MAX_ATTEMPTS} reminders`,
        });
      }
      continue;
    }
    if (attempts === 0 || now - lastTry > RESEND_AFTER_MS) {
      try {
        await dispatch(doc.ref, item);
      } catch (err) {
        logger.error('dispatch failed', doc.id, err);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/** Records an alert and drops it into every manager's/admin's IoT notifications (→ phone push). */
async function raiseAlert(alert: Json) {
  const now = Date.now();
  const ref = await db().collection(ALERTS).add({...alert, createdAt: now});
  const managers = await db().collection(USERS).where('role', 'in', ['admin', 'manager']).get();
  const batch = db().batch();
  for (const m of managers.docs) {
    batch.set(db().collection('notifications').doc(), {
      targetUserId: m.id,
      sourceDeviceName: 'MP Assistant',
      text: alert.text,
      isHandled: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'mp_alert',
      alertId: ref.id,
    });
  }
  await batch.commit();
}

/** Every 15 minutes: phones not opened for 24h, failed posts, failed DMS syncs. */
export const mpMonitor = onSchedule({schedule: 'every 15 minutes', timeZone: 'America/New_York'}, async () => {
  const now = Date.now();
  const names = new Map<string, string>();
  const nameOf = async (uid: string) => {
    if (!names.has(uid)) names.set(uid, String((await mpProfile(uid))?.name || 'Unknown'));
    return names.get(uid)!;
  };

  const phones = await db().collection('devices').where('source', '==', 'tigon-iot-app').get();
  for (const d of phones.docs) {
    const p = d.data() as Json;
    const lastSeen = p.lastSeen || 0;
    if (p.status === 'revoked' || !lastSeen || now - lastSeen < OFFLINE_ALERT_MS) continue;
    if ((p.offlineAlertAt || 0) > lastSeen) continue; // already alerted for this offline stretch
    const hours = Math.round((now - lastSeen) / 3_600_000);
    await raiseAlert({
      kind: 'device_offline', deviceId: d.id, userId: p.userId,
      text: `Phone offline: ${p.deviceName} (${await nameOf(p.userId)}) hasn't opened TIGON IOT in ${hours}h.`,
    });
    await d.ref.update({offlineAlertAt: now});
  }

  const failed = await db().collection(QUEUE).where('status', '==', 'failed').get();
  for (const q of failed.docs) {
    const item = q.data() as Json;
    if (item.failAlertedAt) continue;
    await raiseAlert({
      kind: 'post_failed', queueId: q.id, userId: item.assignedUserId,
      text: `Post failed: ${item.cartTitle} for ${await nameOf(item.assignedUserId)}${item.lastError ? ` — ${item.lastError}` : ''}`,
    });
    await q.ref.update({failAlertedAt: now});
  }

  const syncRef = db().doc('mp_meta/sync');
  const sync = (await syncRef.get()).data() as Json | undefined;
  if (sync && sync.ok === false && (sync.alertedAt || 0) < (sync.finishedAt || 0)) {
    await raiseAlert({kind: 'sync_failed', text: `DMS inventory sync failed: ${sync.error || 'unknown error'}`});
    await syncRef.update({alertedAt: now});
  }
});
