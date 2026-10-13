// "Sell more" release — the shared triggers. Each calls every track's handler in turn; one track failing never
// stops the others.
//   mpSalesLeadCreated : mp_leads created → assignment (T1), auto-text + cadence (T2), referral credit (T5)
//   mpSalesLeadUpdated : mp_leads updated → texting (T2), referrals (T5)
//   mpSalesTick        : every 5 minutes → speed-to-lead + claim timeouts (T1), texting (T2), appointments (T3)
//   mpSalesHourly      : every hour → daily call list at its hour (T1), inventory + marketing once a day (T4, T5)
import * as logger from 'firebase-functions/logger';
import {onDocumentCreated, onDocumentUpdated} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {loadSalesSettings} from './settings';
import {C, TZ, db, nyDateKey, nyParts} from './util';
import type {Json} from './util';
import {assignNewLead, dailyCallList, speedTick} from './routing';
import {onLeadUpdatedTexting, onNewLeadTexting, textingTick} from './texting';
import {appointmentTick} from './closing';
import {inventoryDaily} from './inventory';
import {marketingDaily, onLeadUpdatedMarketing, onNewLeadMarketing} from './marketing';
import {raiseSystemAlert} from '../alerts';

const LABEL: Record<string, string> = {
  assignNewLead: 'New-lead assignment', onNewLeadTexting: 'New-lead auto-text', onNewLeadMarketing: 'Referral credit',
  onLeadUpdatedTexting: 'Lead-change texting', onLeadUpdatedMarketing: 'Referral rewards', speedTick: 'Speed-to-lead alerts',
  textingTick: 'Texting queue', appointmentTick: 'Appointment reminders', dailyCallList: 'Daily call list',
  inventoryDaily: 'Aged-inventory summary', marketingDaily: 'Google reviews refresh',
};

/** Runs one track's handler; a failure is logged and raised as a system alert (once a day per handler). */
async function safe(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    logger.error(`sales: ${name} failed`, e);
    const what = LABEL[name] || name;
    await raiseSystemAlert({
      key: `sales_${name}`, title: `${what} failed`, severity: 'error',
      text: `${what} failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 600),
    });
    return false;
  }
}

export const mpSalesLeadCreated = onDocumentCreated(`${C.leads}/{id}`, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const id = event.params.id;
  const s = await loadSalesSettings();
  let lead = snap.data() as Json;
  await safe('assignNewLead', async () => {
    // Retries (same event) or a second delivery must not assign twice.
    const fresh = await snap.ref.get();
    if (!fresh.exists) return;
    const cur = fresh.data() as Json;
    if (cur.assignedAt || cur.assignEventId === event.id) {
      lead = {...lead, ...cur};
      return;
    }
    const patch = await assignNewLead(id, cur, s);
    const written = await db().runTransaction(async (tx) => {
      const now = await tx.get(snap.ref);
      if (!now.exists || now.get('assignedAt') || now.get('assignEventId') === event.id) return null;
      const p = {...(patch || {}), assignEventId: event.id, updatedAt: Date.now()};
      tx.set(snap.ref, p, {merge: true});
      return p;
    });
    if (written) lead = {...lead, ...written};
  });
  await safe('onNewLeadTexting', () => onNewLeadTexting(id, lead, s));
  await safe('onNewLeadMarketing', () => onNewLeadMarketing(id, lead, s));
});

export const mpSalesLeadUpdated = onDocumentUpdated(`${C.leads}/{id}`, async (event) => {
  const before = event.data?.before.data() as Json | undefined;
  const after = event.data?.after.data() as Json | undefined;
  if (!before || !after) return;
  const id = event.params.id;
  const s = await loadSalesSettings();
  await safe('onLeadUpdatedTexting', () => onLeadUpdatedTexting(id, before, after, s));
  await safe('onLeadUpdatedMarketing', () => onLeadUpdatedMarketing(id, before, after, s));
});

export const mpSalesTick = onSchedule({schedule: 'every 5 minutes', timeZone: TZ, timeoutSeconds: 240}, async () => {
  const now = Date.now();
  const s = await loadSalesSettings(true);
  await safe('speedTick', () => speedTick(now, s));
  await safe('textingTick', () => textingTick(now, s));
  await safe('appointmentTick', () => appointmentTick(now, s));
});

/** A daily job holds this lease while running (the hourly function's timeout is 9 minutes). */
const DAILY_LEASE_MS = 10 * 60_000;

/**
 * Runs `fn` at most once per New York day, at or after `hour`. A short lease stops overlapping runs; the "done today"
 * marker is written only after `fn` succeeded, so a failed run is tried again the next hour (and raises an alert).
 */
export async function oncePerDay(key: string, hour: number, now: number, fn: () => Promise<unknown>) {
  if (nyParts(now).hour < hour) return;
  const today = nyDateKey(now);
  const ref = db().collection(C.meta).doc('sales_daily');
  const go = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (s.get(key) === today) return false;
    if (Number(s.get(`${key}Lease`) || 0) > now) return false;
    tx.set(ref, {[`${key}Lease`]: now + DAILY_LEASE_MS}, {merge: true});
    return true;
  });
  if (!go) return;
  const ok = await safe(key, fn);
  await ref.set(ok ? {[key]: today, [`${key}At`]: now, [`${key}Lease`]: 0} : {[`${key}Lease`]: 0, [`${key}FailedAt`]: Date.now()}, {merge: true});
}

export const mpSalesHourly = onSchedule({schedule: 'every 60 minutes', timeZone: TZ, timeoutSeconds: 540, memory: '512MiB'}, async () => {
  const now = Date.now();
  const s = await loadSalesSettings(true);
  if (s.dailyList.enabled) await oncePerDay('dailyCallList', s.dailyList.hour, now, () => dailyCallList(now, s));
  await oncePerDay('inventoryDaily', 7, now, () => inventoryDaily(now, s));
  await oncePerDay('marketingDaily', 6, now, () => marketingDaily(now, s));
});
