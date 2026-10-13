// mpRetention (daily, 04:30 New York): deletes old data in chunks of 400 so collections stay small and cheap.
//   notifications        > 60 days (createdAt Timestamp; old numeric createdAt too)
//   mp_events, mp_clicks > 400 days (ts)            mp_device_online > 400 days (date 'YYYY-MM-DD')
//   mp_sms               > 2 years (createdAt)      mp_sms_inbound   > 2 years (receivedAt)
//   mp_alerts            > 90 days (createdAt; alerts are "resolved" by deleting them, so age is what's left)
//   mp_meta rate/lock/marker docs whose expireAt passed (pub_rate_*, echo_rate_*, book_*, pub_phone_*, mc_*, …)
//   wh_sheet_rows        > 120 days (at)            wh_sheet_buffer dead rows > 30 days (deadAt; alert first)
// (wh_submissions use whMaintenance's retentionDays — default 730 days.)
import * as logger from 'firebase-functions/logger';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {raiseSystemAlert} from './alerts';
import {nyDateKey} from './sales/util';

const DAY = 86_400_000;
const CHUNK = 400;
const db = () => admin.firestore();
type Q = admin.firestore.Query;

/** Deletes every doc the query returns, CHUNK at a time, until it's empty or the deadline. Returns the count. */
export async function deleteQuery(q: Q, deadline: number, filter?: (d: admin.firestore.QueryDocumentSnapshot) => boolean): Promise<number> {
  let n = 0;
  while (Date.now() < deadline) {
    const snap = await q.limit(CHUNK).get();
    if (snap.empty) break;
    const docs = filter ? snap.docs.filter(filter) : snap.docs;
    if (docs.length) {
      const b = db().batch();
      docs.forEach((d) => b.delete(d.ref));
      await b.commit();
      n += docs.length;
    }
    // A filter that keeps everything in the page would loop forever: stop then.
    if (snap.size < CHUNK || docs.length === 0) break;
  }
  return n;
}

export async function runRetention(now = Date.now(), budgetMs = 480_000): Promise<Record<string, number>> {
  const deadline = now + budgetMs;
  const T = admin.firestore.Timestamp;
  const out: Record<string, number> = {};
  const step = async (name: string, fn: () => Promise<number>) => {
    try {
      out[name] = await fn();
    } catch (e) {
      logger.error(`mpRetention: ${name} failed`, e);
      out[name] = -1;
    }
  };
  const col = (c: string) => db().collection(c);

  await step('notifications', async () =>
    await deleteQuery(col('notifications').where('createdAt', '<', T.fromMillis(now - 60 * DAY)), deadline) +
    // Older docs stored createdAt as a number (a number filter only matches numbers).
    await deleteQuery(col('notifications').where('createdAt', '<', now - 60 * DAY), deadline));
  await step('mp_events', () => deleteQuery(col('mp_events').where('ts', '<', now - 400 * DAY), deadline));
  await step('mp_clicks', () => deleteQuery(col('mp_clicks').where('ts', '<', now - 400 * DAY), deadline));
  await step('mp_device_online', () => deleteQuery(col('mp_device_online').where('date', '<', nyDateKey(now - 400 * DAY)), deadline));
  await step('mp_sms', () => deleteQuery(col('mp_sms').where('createdAt', '<', now - 730 * DAY), deadline));
  await step('mp_sms_inbound', () => deleteQuery(col('mp_sms_inbound').where('receivedAt', '<', now - 730 * DAY), deadline));
  await step('mp_alerts', () => deleteQuery(col('mp_alerts').where('createdAt', '<', now - 90 * DAY), deadline));
  await step('mp_meta_expired', async () =>
    await deleteQuery(col('mp_meta').where('expireAt', '<', T.fromMillis(now)), deadline) +
    // Older counters stored expireAt as a number.
    await deleteQuery(col('mp_meta').where('expireAt', '<', now), deadline));
  await step('wh_sheet_rows', () => deleteQuery(col('wh_sheet_rows').where('at', '<', now - 120 * DAY), deadline));
  await step('wh_sheet_buffer_dead', async () => {
    const q = col('wh_sheet_buffer').where('deadAt', '<', now - 30 * DAY);
    const peek = await q.limit(CHUNK).get();
    const dead = peek.docs.filter((d) => d.get('dead') === true);
    if (!dead.length) return 0;
    await raiseSystemAlert({key: 'sheets_dead_purged', title: 'Old stuck Google Sheets rows deleted', severity: 'warning',
      text: `${dead.length}${peek.size >= CHUNK ? '+' : ''} website lead row(s) never reached Google Sheets in 30 days and are being deleted ` +
        '(the leads themselves are still in Webhook Flows).'});
    return deleteQuery(q, deadline, (d) => d.get('dead') === true);
  });
  return out;
}

export const mpRetention = onSchedule({schedule: 'every day 04:30', timeZone: 'America/New_York', timeoutSeconds: 540, memory: '512MiB'}, async () => {
  const r = await runRetention();
  logger.info('mpRetention done', r);
  if (Object.values(r).some((n) => n < 0)) {
    await raiseSystemAlert({key: 'retention', title: 'Data clean-up had problems', severity: 'warning',
      text: `The nightly clean-up could not finish: ${Object.entries(r).filter(([, n]) => n < 0).map(([k]) => k).join(', ')}.`});
  }
});
