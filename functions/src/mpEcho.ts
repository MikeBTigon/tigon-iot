// Notification echo: Android phones running the TIGON IOT app forward the notifications they receive
// (Facebook, Messenger, …) to the dashboard, labeled with the phone's team number (#0003).
//   mpEchoRegister : callable — the signed-in phone gets a per-device echo secret (stored hashed on the device doc)
//   mpEcho         : HTTP (Hosting /api/echo) — the phone's native notification listener posts here, even while the
//                    app is closed; creates a `notifications` doc for the phone's owner (dashboard + push to masters)
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall, onRequest} from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {createHash, randomBytes, timingSafeEqual} from 'crypto';
import {isFacebookMessage} from './fbFilter';

const db = () => admin.firestore();
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const MAX_PER_MINUTE = 60;

/** Phone app (signed in): returns this phone's echo credentials. A new secret replaces the old one. */
export const mpEchoRegister = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const deviceId = String(req.data?.deviceId || '');
  if (!/^app_[A-Za-z0-9-]{8,64}_[A-Za-z0-9]{1,128}$/.test(deviceId)) throw new HttpsError('invalid-argument', 'Bad device id');
  const ref = db().collection('devices').doc(deviceId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'This phone is not set up yet');
  if (snap.get('userId') !== req.auth.uid) throw new HttpsError('permission-denied', 'This phone belongs to someone else');
  if (snap.get('status') === 'revoked') throw new HttpsError('failed-precondition', 'This phone was revoked');
  const secret = randomBytes(24).toString('base64url');
  await ref.set({echoSecretHash: sha256(secret), echoRegisteredAt: Date.now()}, {merge: true});
  return {deviceId, secret, deviceName: String(snap.get('deviceName') || ''), deviceNumber: String(snap.get('deviceNumber') || '')};
});

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v)).slice(0, n);

/** Native listener → dashboard. Body: {deviceId, secret, items: [{key, pkg, app, title, text, postedAt}]} (max 20). */
export const mpEcho = onRequest({memory: '256MiB', timeoutSeconds: 30}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ok: false});
    return;
  }
  try {
    const b = (typeof req.body === 'object' && req.body) || {};
    const deviceId = clip(b.deviceId, 200);
    const secret = clip(b.secret, 200);
    if (!deviceId || !secret || deviceId.includes('/')) {
      res.status(400).json({ok: false, error: 'missing device'});
      return;
    }
    const ref = db().collection('devices').doc(deviceId);
    const dev = await ref.get();
    const hash = String(dev.get('echoSecretHash') || '');
    const given = sha256(secret);
    if (!dev.exists || !hash || hash.length !== given.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(given))) {
      res.status(401).json({ok: false, error: 'unknown device'});
      return;
    }
    if (dev.get('status') === 'revoked') {
      res.status(410).json({ok: false, error: 'revoked'});
      return;
    }
    const items = (Array.isArray(b.items) ? b.items : [b]).slice(0, 20);
    // Simple per-phone rate limit.
    const minute = Math.floor(Date.now() / 60000);
    const rateRef = db().collection('mp_meta').doc(`echo_rate_${deviceId}`);
    const count = await db().runTransaction(async (tx) => {
      const r = await tx.get(rateRef);
      const n = r.get('minute') === minute ? Number(r.get('count') || 0) : 0;
      tx.set(rateRef, {minute, count: n + items.length});
      return n + items.length;
    });
    if (count > MAX_PER_MINUTE) {
      res.status(429).json({ok: false, error: 'too many'});
      return;
    }
    const userId = String(dev.get('userId'));
    const deviceName = String(dev.get('deviceName') || 'Phone');
    const deviceNumber = String(dev.get('deviceNumber') || '');
    const batch = db().batch();
    let created = 0;
    for (const it of items) {
      const title = clip(it.title, 300).trim();
      const text = clip(it.text, 4000).trim();
      if (!title && !text) continue;
      // Dashboard gets Facebook messages / Messenger chats / DMs only (TikTok, Gmail, carrier, likes… are dropped).
      if (!isFacebookMessage(clip(it.pkg, 120), clip(it.app, 80), title, text, clip(it.cat, 20))) continue;
      const postedAt = Number(it.postedAt) || Date.now();
      // Same notification sent twice (retry) → same doc.
      const id = `echo_${sha256(`${deviceId}|${clip(it.key, 300)}|${postedAt}|${title}|${text}`).slice(0, 32)}`;
      batch.set(db().collection('notifications').doc(id), {
        targetUserId: userId,
        sourceDeviceId: deviceId,
        sourceDeviceName: deviceName,
        sourceDeviceNumber: deviceNumber,
        sourceApp: clip(it.app, 80) || clip(it.pkg, 120),
        sourcePackage: clip(it.pkg, 120),
        title,
        text: title && text ? `${title}: ${text}` : title || text,
        postedAt,
        isHandled: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'tigon-iot-echo',
      });
      created++;
    }
    if (created) {
      batch.set(ref, {lastSeen: Date.now(), lastEchoAt: Date.now()}, {merge: true});
      await batch.commit();
    }
    res.json({ok: true, created, skipped: items.length - created});
  } catch (e) {
    logger.error('mpEcho failed', e);
    res.status(500).json({ok: false});
  }
});
