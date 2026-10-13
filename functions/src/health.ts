// mpHealth (every 15 minutes): one place that checks the things that fail quietly, raises a system alert for each
// problem (once a day per problem — alerts.ts) and writes a summary for the Status page:
//   mp_meta/health {checks: [{key, ok, detail, at}], updatedAt}
// Checks: texting phone silent while texts wait, DMS sync stale/failed, nightly backup, Google Sheets dead rows,
// Webhook Flows backlog, and an uptime check of the website + public booking API (alert after 2 failures in a row).
import * as logger from 'firebase-functions/logger';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {raiseSystemAlert} from './alerts';
import {checkDmsSync} from './mpOps';
import {checkBackup} from './mpTeam';
import {loadSalesSettings} from './sales/settings';
import {phoneForStore, twilioOn} from './sales/texting';
import {C, MIN_MS} from './sales/util';

export interface HealthCheck {key: string; ok: boolean; detail: string; at: number}

const db = () => admin.firestore();
const SILENT_MS = 15 * MIN_MS;
export const UPTIME_URLS = ['https://tigoniot.com/', 'https://tigoniot.com/api/public/booking/info?store=T1'];

/** Texts waiting > 15 min whose texting phone hasn't checked in for 15 min → alert per phone. */
export async function checkTextingPhones(now = Date.now()): Promise<HealthCheck> {
  const at = now;
  const s = await loadSalesSettings(true);
  if (twilioOn(s)) return {key: 'texting_phone', ok: true, detail: 'Texts go out by Twilio', at};
  const snap = await db().collection(C.sms).where('queueAt', '<=', now - SILENT_MS).orderBy('queueAt').limit(25).get();
  const waiting = snap.docs.filter((d) => d.get('status') === 'queued');
  if (!waiting.length) return {key: 'texting_phone', ok: true, detail: 'No texts waiting', at};
  const byPhone = new Map<string, number>();
  let noPhone = 0;
  for (const d of waiting) {
    const dev = phoneForStore(String(d.get('storeId') || ''), s);
    if (!dev) noPhone++;
    else byPhone.set(dev, (byPhone.get(dev) || 0) + 1);
  }
  const silent: string[] = [];
  for (const [deviceId, n] of byPhone) {
    const dev = await db().collection(C.devices).doc(deviceId).get();
    const last = Number(dev.get('lastPingAt') || dev.get('lastSeen') || 0);
    if (now - last < SILENT_MS) continue;
    const name = String(dev.get('deviceName') || deviceId);
    silent.push(name);
    await raiseSystemAlert({
      key: `texting_phone_silent_${deviceId}`, title: 'Texting phone is silent', severity: 'error',
      text: `${n}${n >= 25 ? '+' : ''} text(s) are waiting, but the texting phone ${name} hasn't checked in ` +
        `${last ? `for ${Math.round((now - last) / MIN_MS)} min` : 'yet'}. Open TIGON IOT on that phone and keep it online.`,
    });
  }
  if (noPhone) {
    await raiseSystemAlert({key: 'texting_no_phone', title: 'No texting phone set up', severity: 'warning',
      text: `${noPhone} text(s) are waiting because no texting phone is set up for their store (Sell more → Texting).`});
  }
  const ok = !silent.length && !noPhone;
  return {key: 'texting_phone', ok, at,
    detail: ok ? `${waiting.length} text(s) waiting; phones online` :
      [silent.length ? `Silent: ${silent.join(', ')}` : '', noPhone ? `${noPhone} with no texting phone` : ''].filter(Boolean).join('; ')};
}

/** Google Sheets rows that gave up (wh_settings/sheets_status.deadRows). */
export async function checkSheets(now = Date.now()): Promise<HealthCheck> {
  const st = (await db().collection('wh_settings').doc('sheets_status').get()).data() || {};
  const dead = Number(st.deadRows || 0);
  if (dead > 0) {
    await raiseSystemAlert({key: 'sheets_dead_rows', title: 'Google Sheets rows failing', severity: 'error',
      text: `${dead} website lead row(s) are stuck and not in Google Sheets${st.lastError ? `: ${String(st.lastError).slice(0, 200)}` : ''}. ` +
        'Check Webhook Flows → Needs attention.'});
  }
  return {key: 'sheets', ok: dead === 0, detail: dead ? `${dead} row(s) stuck` : 'All rows written', at: now};
}

/** Website submissions due for over 30 minutes and not processed (whProcess stuck/behind). */
export async function checkWhBacklog(now = Date.now()): Promise<HealthCheck> {
  const snap = await db().collection('wh_submissions').where('nextRunAt', '<=', now - 30 * MIN_MS).limit(5).get();
  const stuck = snap.docs.filter((d) => ['queued', 'processing'].includes(String(d.get('status'))));
  if (stuck.length) {
    await raiseSystemAlert({key: 'wh_backlog', title: 'Website leads are waiting', severity: 'error',
      text: `${stuck.length}${snap.size >= 5 ? '+' : ''} website lead(s) have waited over 30 minutes to be processed. Check Webhook Flows.`});
  }
  return {key: 'wh_backlog', ok: !stuck.length, detail: stuck.length ? `${stuck.length}+ waiting over 30 min` : 'No backlog', at: now};
}

type Fetcher = typeof fetch;

/** Website + public API reachable? Alert after 2 failed checks in a row (state in mp_meta/health.uptimeFails). */
export async function checkUptime(prevFails: number, now = Date.now(), fetcher: Fetcher = fetch): Promise<{check: HealthCheck; fails: number}> {
  const problems: string[] = [];
  for (const url of UPTIME_URLS) {
    try {
      const r = await fetcher(url, {signal: AbortSignal.timeout(10_000), redirect: 'follow'});
      if (!r.ok) problems.push(`${url} → HTTP ${r.status}`);
    } catch (e) {
      problems.push(`${url} → ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const fails = problems.length ? prevFails + 1 : 0;
  if (fails >= 2) {
    await raiseSystemAlert({key: 'uptime', title: 'Website is down', severity: 'error',
      text: `tigoniot.com did not answer twice in a row: ${problems.join('; ')}`.slice(0, 600)});
  }
  return {fails, check: {key: 'uptime', ok: !problems.length, detail: problems.length ? problems.join('; ').slice(0, 300) : 'Website and booking API up', at: now}};
}

async function guarded(key: string, fn: () => Promise<HealthCheck>): Promise<HealthCheck> {
  try {
    return await fn();
  } catch (e) {
    logger.error(`mpHealth: ${key} check failed`, e);
    return {key, ok: false, detail: `Check failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300), at: Date.now()};
  }
}

export async function runHealth(now = Date.now()) {
  const ref = db().collection(C.meta).doc('health');
  const prev = (await ref.get()).data() || {};
  const checks: HealthCheck[] = [];
  checks.push(await guarded('texting_phone', () => checkTextingPhones(now)));
  checks.push(await guarded('dms_sync', async () => ({key: 'dms_sync', at: now, ...(await checkDmsSync(now))})));
  checks.push(await guarded('backup', async () => ({key: 'backup', at: now, ...(await checkBackup(now))})));
  checks.push(await guarded('sheets', () => checkSheets(now)));
  checks.push(await guarded('wh_backlog', () => checkWhBacklog(now)));
  let fails = Number(prev.uptimeFails || 0);
  checks.push(await guarded('uptime', async () => {
    const r = await checkUptime(fails, now);
    fails = r.fails;
    return r.check;
  }));
  await ref.set({checks, ok: checks.every((c) => c.ok), uptimeFails: fails, updatedAt: now});
  return checks;
}

export const mpHealth = onSchedule({schedule: 'every 15 minutes', timeZone: 'America/New_York', timeoutSeconds: 300}, async () => {
  const checks = await runHealth();
  const bad = checks.filter((c) => !c.ok);
  if (bad.length) logger.warn('mpHealth problems', bad);
});
