// One alert path for system problems (failed jobs, stale DMS sync, silent texting phone, backups, …):
//   raiseSystemAlert({key, title, text, severity}) →
//     mp_alerts/{key}_{day}      (System Triage / Status page; one per key per New York day — never repeats that day)
//     notifications              (every admin and manager → dashboard + phone push)
//     email                      (optional, to iot@tigongolfcarts.com through the Webhook Flows email server)
import * as admin from 'firebase-admin';
import {FieldValue} from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import {expireIn, notificationExpireAt, nyDateKey} from './sales/util';
import {isInactiveStatus} from './membership';
import type {WhSettings} from './wh/types';

export type AlertSeverity = 'info' | 'warning' | 'error';

export interface SystemAlert {
  /** Stable key for the problem (e.g. 'dms_stale', 'sales_textingTick'). One alert per key per day. */
  key: string;
  /** Short title (email subject / first words). */
  title: string;
  /** Plain-English text shown in the notification. */
  text: string;
  severity?: AlertSeverity;
  /** Email iot@tigongolfcarts.com too (default: only for 'error'). */
  email?: boolean;
  /** Extra fields stored on the mp_alerts doc. */
  extra?: Record<string, unknown>;
}

export const ALERT_EMAIL = 'iot@tigongolfcarts.com';
const db = () => admin.firestore();
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || 'alert';

/** Doc id of today's alert for a key. */
export const alertId = (key: string, now = Date.now()) => `${safeKey(key)}_${nyDateKey(now).replace(/-/g, '')}`;

/** Admin/manager uids. */
async function managerUids(): Promise<string[]> {
  const snap = await db().collection('mp_users').where('role', 'in', ['admin', 'manager']).get();
  return snap.docs.filter((d) => !isInactiveStatus(d.get('status'))).map((d) => d.id);
}

/**
 * Records a system alert once per key per New York day. Returns the alert id, or null when it was already raised today.
 * Never throws (an alert must never break the job that raised it).
 */
export async function raiseSystemAlert(a: SystemAlert): Promise<string | null> {
  try {
    const now = Date.now();
    const id = alertId(a.key, now);
    const severity = a.severity || 'error';
    // The marker (not the alert doc) is the "already raised today" check: people may delete the alert doc.
    const marker = db().collection('mp_meta').doc(`alertmark_${id}`);
    try {
      await marker.create({key: a.key, at: now, expireAt: expireIn(3 * 24 * 3600_000)});
    } catch {
      return null;
    }
    const text = a.text.slice(0, 800);
    const uids = await managerUids();
    const batch = db().batch();
    batch.set(db().collection('mp_alerts').doc(id), {
      ...(a.extra || {}), kind: safeKey(a.key), key: a.key, title: a.title.slice(0, 200), text, severity,
      source: 'system', createdAt: now,
    });
    for (const uid of uids.slice(0, 400)) {
      batch.set(db().collection('notifications').doc(`alert_${id}_${uid}`), {
        targetUserId: uid, sourceDeviceName: 'TIGON IOT', text, isHandled: false,
        createdAt: FieldValue.serverTimestamp(), expireAt: notificationExpireAt(),
        source: 'mp_alert', alertId: id,
      });
    }
    await batch.commit();
    if (a.email ?? severity === 'error') await emailAlert(a.title, text);
    logger.warn('system alert', {key: a.key, title: a.title});
    return id;
  } catch (e) {
    logger.error('raiseSystemAlert failed', a.key, e);
    return null;
  }
}

/** Email to iot@tigongolfcarts.com (skipped quietly when no email server is set up). */
export async function emailAlert(title: string, text: string): Promise<boolean> {
  try {
    // Loaded on use: the email module imports the Webhook Flows steps (avoids an import cycle with sheets.ts).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {sendMail} = require('./wh/steps/email') as typeof import('./wh/steps/email');
    const settings = ((await db().collection('wh_settings').doc('global').get()).data() || {}) as WhSettings;
    const esc = text.replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c] as string));
    await sendMail(settings, {
      to: [ALERT_EMAIL], subject: `TIGON IOT alert: ${title}`.slice(0, 200),
      html: `<p style="font-family:Arial,sans-serif;font-size:14px">${esc}</p>` +
        '<p style="font-family:Arial,sans-serif;font-size:12px;color:#888">Open <a href="https://tigoniot.com/mp/status">tigoniot.com</a> → Status for details.</p>',
      text: `${text}\n\nhttps://tigoniot.com/mp/status`,
    });
    return true;
  } catch (e) {
    logger.warn('alert email not sent', e instanceof Error ? e.message : e);
    return false;
  }
}
