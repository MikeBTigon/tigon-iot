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

async function safe(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    logger.error(`sales: ${name} failed`, e);
  }
}

export const mpSalesLeadCreated = onDocumentCreated(`${C.leads}/{id}`, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const id = event.params.id;
  const s = await loadSalesSettings();
  let lead = snap.data() as Json;
  await safe('assignNewLead', async () => {
    const patch = await assignNewLead(id, lead, s);
    if (patch && Object.keys(patch).length) {
      await snap.ref.set({...patch, updatedAt: Date.now()}, {merge: true});
      lead = {...lead, ...patch};
    }
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

/** Runs `fn` at most once per New York day, at or after `hour`. */
async function oncePerDay(key: string, hour: number, now: number, fn: () => Promise<unknown>) {
  if (nyParts(now).hour < hour) return;
  const today = nyDateKey(now);
  const ref = db().collection(C.meta).doc('sales_daily');
  const ran = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (s.get(key) === today) return false;
    tx.set(ref, {[key]: today, [`${key}At`]: now}, {merge: true});
    return true;
  });
  if (ran) await safe(key, fn);
}

export const mpSalesHourly = onSchedule({schedule: 'every 60 minutes', timeZone: TZ, timeoutSeconds: 540, memory: '512MiB'}, async () => {
  const now = Date.now();
  const s = await loadSalesSettings(true);
  if (s.dailyList.enabled) await oncePerDay('dailyCallList', s.dailyList.hour, now, () => dailyCallList(now, s));
  await oncePerDay('inventoryDaily', 7, now, () => inventoryDaily(now, s));
  await oncePerDay('marketingDaily', 6, now, () => marketingDaily(now, s));
});
