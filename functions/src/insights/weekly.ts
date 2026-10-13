// Insights — weekly owner email.
//   mpOwnerWeekly     Mondays 07:00 New York → iot@tigongolfcarts.com (or mp_settings/insights.ownerEmail)
//   mpOwnerWeeklyNow  callable (admins) → sends the last 7 days now
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {STORES} from '../mpShare';
import {loadSalesSettings} from '../sales/settings';
import {C, DAY_MS, db, loadPeople, nyDateKey, nyTime} from '../sales/util';
import type {Json} from '../sales/util';
import {buildWeekly, renderWeekly} from './weeklyCore';
import type {WeeklyInput} from './weeklyCore';
import {callerOf} from './people';
import {sendReport} from './mail';

const DEFAULT_TO = 'iot@tigongolfcarts.com';

const range = (col: string, field: string, from: number, to?: number) =>
  db().collection(col).where(field, '>=', from).get().then((s) => s.docs.map((d) => ({id: d.id, ...d.data()} as Json))
    .filter((x) => to === undefined || Number(x[field]) < to));

export async function loadWeekly(from: number, to: number): Promise<WeeklyInput> {
  const now = Date.now();
  const [settings, people, leads, sold, apptsCreated, apptsStarting, quotesCreated, quotesOpened, carts, reviews, queued, smsWeek] = await Promise.all([
    loadSalesSettings(true),
    loadPeople(),
    range(C.leads, 'createdAt', from, to),
    range(C.leads, 'soldAt', from, to).then((l) => l.filter((x) => x.status === 'sold')),
    range(C.appointments, 'createdAt', from, to),
    range(C.appointments, 'startAt', from, to),
    range(C.quotes, 'createdAt', from, to),
    range(C.quotes, 'openedAt', from, to),
    db().collection(C.carts).select('stockedAt', 'firstSeenAt', 'createdAt', 'soldLocally').get().then((s) => s.docs.map((d) => d.data() as Json)),
    db().collection(C.reviews).get().then((s) => s.docs.map((d) => ({id: d.id, ...d.data()} as Json))),
    db().collection(C.sms).where('status', '==', 'queued').get().then((s) => s.docs.map((d) => d.data() as Json)),
    range(C.sms, 'createdAt', from, to),
  ]);
  const senders = new Map<string, string>(); // deviceId → storeId
  for (const [store, dev] of Object.entries(settings.sms?.senderDeviceByStore || {})) if (dev) senders.set(String(dev), store);
  if (settings.sms?.defaultSenderDeviceId && !senders.has(settings.sms.defaultSenderDeviceId)) senders.set(settings.sms.defaultSenderDeviceId, '');
  const textingPhones = await Promise.all([...senders.entries()].map(async ([deviceId, storeId]) => {
    const d = await db().collection(C.devices).doc(deviceId).get();
    return {storeId, deviceId, name: String(d.get('deviceName') || 'Phone'), lastPingAt: Number(d.get('lastPingAt') || d.get('lastSeen') || 0)};
  }));
  return {
    from, to, now, leads, sold, apptsCreated, apptsStarting, quotesCreated, quotesOpened, carts,
    agedFlagDays: Number(settings.aged?.flagDays) || 45, agedUrgentDays: Number(settings.aged?.urgentDays) || 60,
    reviews, textingPhones, queued, smsWeek,
    people: Object.fromEntries(people.map((p) => [p.uid, p.name])),
    stores: Object.fromEntries(STORES.map((s) => [s.id, s.name])),
  };
}

async function recipient(): Promise<string> {
  const s = (await db().collection('mp_settings').doc('insights').get()).data() || {};
  return typeof s.ownerEmail === 'string' && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s.ownerEmail) ? s.ownerEmail : DEFAULT_TO;
}

export async function sendWeekly(from: number, to: number): Promise<{to: string; leads: number; sales: number}> {
  const report = buildWeekly(await loadWeekly(from, to));
  const mail = renderWeekly(report);
  const dest = await recipient();
  await sendReport({to: [dest], ...mail});
  logger.info('owner weekly sent', {to: dest, leads: report.leads.total, sales: report.sales.count});
  return {to: dest, leads: report.leads.total, sales: report.sales.count};
}

export const mpOwnerWeekly = onSchedule({schedule: '0 7 * * 1', timeZone: 'America/New_York', timeoutSeconds: 300, memory: '512MiB'}, async () => {
  // The 7 New York days before today (Monday → last Monday through Sunday).
  const to = nyTime(nyDateKey(Date.now()), '00:00');
  const from = nyTime(nyDateKey(to - DAY_MS * 7 + 3 * 3600_000), '00:00');
  await sendWeekly(from, to);
});

export const mpOwnerWeeklyNow = onCall({timeoutSeconds: 300, memory: '512MiB'}, async (req) => {
  await callerOf(req, 'admin');
  const to = Date.now();
  try {
    return await sendWeekly(to - 7 * DAY_MS, to);
  } catch (e) {
    logger.error('mpOwnerWeeklyNow failed', e);
    throw new HttpsError('failed-precondition', (e as Error).message || 'The report could not be sent.');
  }
});
