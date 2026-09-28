// Webhook Flows — nightly maintenance: retention, expired rate counters, and the Master Digest email.
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {WH} from './types';
import type {WhDayStats} from './types';
import {escapeHtml, resolveSettings} from './shared';
import {db, loadFlow, loadGlobal} from './config';
import {nyDay, nyDayBounds, TZ} from './stats';
import {sendMail} from './steps';

const DAY = 86_400_000;
const APP_URL = 'https://tigoniot.com/wh';

/** Delete submissions older than retentionDays with their step runs and uploaded images. */
export async function runRetention(retentionDays: number, maxDocs = 3000) {
  if (!(retentionDays > 0)) return {submissions: 0, runs: 0};
  const cutoff = Date.now() - retentionDays * DAY;
  let submissions = 0;
  let runs = 0;
  const bucket = admin.storage().bucket();
  while (submissions < maxDocs) {
    const snap = await db().collection(WH.submissions).where('receivedAt', '<', cutoff).limit(100).get();
    if (snap.empty) break;
    for (const s of snap.docs) {
      const rs = await db().collection(WH.stepRuns).where('submissionId', '==', s.id).limit(500).get();
      const batch = db().batch();
      rs.docs.forEach((r) => batch.delete(r.ref));
      batch.delete(s.ref);
      await batch.commit();
      runs += rs.size;
      submissions++;
      const files = ((s.get('rawPayload') || {}).files || []) as Array<{path?: string}>;
      if (files.some((f) => f.path)) {
        await bucket.deleteFiles({prefix: `wh_uploads/${s.get('webhookId')}/${s.id}/`})
          .catch((e) => logger.warn('wh retention: file delete failed', s.id, e));
      }
    }
    if (snap.size < 100) break;
  }
  return {submissions, runs};
}

export async function purgeRate(maxDocs = 5000) {
  let n = 0;
  while (n < maxDocs) {
    const snap = await db().collection(WH.rate).where('expiresAt', '<', admin.firestore.Timestamp.now()).limit(500).get();
    if (snap.empty) break;
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    n += snap.size;
    if (snap.size < 500) break;
  }
  return n;
}

async function names(collection: string, ids: string[], field: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!ids.length) return out;
  const snaps = await db().getAll(...ids.map((id) => db().collection(collection).doc(id)));
  for (const s of snaps) out[s.id] = s.exists ? String(s.get(field) || s.get('url') || s.id) : `${s.id} (deleted)`;
  return out;
}

const top = (m: Record<string, number> | undefined, n: number) =>
  Object.entries(m || {}).sort((a, b) => b[1] - a[1]).slice(0, n);

/** Build the digest for a New York day ('YYYYMMDD'). Exported for tests. */
export async function buildDigest(day: string) {
  const stats = ((await db().collection(WH.stats).doc('d_' + day).get()).data() || {}) as Partial<WhDayStats>;
  const [start, end] = nyDayBounds(day);
  const runs = await db().collection(WH.stepRuns).where('finishedAt', '>=', start).limit(5000).get();
  const dead = runs.docs.filter((r) => r.get('status') === 'dead' && Number(r.get('finishedAt')) < end);
  const deadByType: Record<string, number> = {};
  for (const r of dead) deadByType[String(r.get('stepType'))] = (deadByType[String(r.get('stepType'))] || 0) + 1;

  const domains = top(stats.byDomain, 30);
  const hooks = top(stats.byWebhook, 20);
  const sources = top(stats.bySource, 10);
  const [domainNames, hookNames] = await Promise.all([
    names(WH.domains, domains.map(([id]) => id), 'name'),
    names(WH.webhooks, hooks.map(([id]) => id), 'formName'),
  ]);
  const total = stats.total || 0;
  const spam = stats.spam || 0;
  const duplicate = stats.duplicate || 0;
  const leads = total - spam;
  const label = new Intl.DateTimeFormat('en-US', {timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'})
    .format(new Date(start + 12 * 3_600_000));

  const row = (a: string, b: string | number) =>
    `<tr><td style="padding:4px 10px;border:1px solid #ddd">${escapeHtml(a)}</td><td style="padding:4px 10px;border:1px solid #ddd;text-align:right">${b}</td></tr>`;
  const table = (title: string, rows: string[]) => rows.length ?
    `<h3 style="margin:18px 0 6px">${escapeHtml(title)}</h3><table style="border-collapse:collapse;font-size:14px">${rows.join('')}</table>` : '';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
<h2 style="margin:0 0 4px">Website leads — ${escapeHtml(label)}</h2>
<p style="margin:0 0 12px">${leads} lead${leads === 1 ? '' : 's'} · ${duplicate} duplicate${duplicate === 1 ? '' : 's'} · ${spam} spam blocked · ${dead.length} failed step${dead.length === 1 ? '' : 's'}</p>
${table('By website', domains.map(([id, n]) => row(domainNames[id] || id, n)))}
${table('By form', hooks.map(([id, n]) => row(hookNames[id] || id, n)))}
${table('Top sources', sources.map(([s, n]) => row(s, n)))}
${table('Failed steps (dead letters)', Object.entries(deadByType).map(([t, n]) => row(t, n)))}
<p style="margin-top:18px"><a href="${APP_URL}">Open Webhook Flows</a>${dead.length ? ` · <a href="${APP_URL}/dead">Review failed steps</a>` : ''}</p>
</div>`;
  const lines = [
    `Website leads — ${label}`,
    `${leads} leads, ${duplicate} duplicates, ${spam} spam blocked, ${dead.length} failed steps`,
    '',
    ...(domains.length ? ['By website:', ...domains.map(([id, n]) => `  ${domainNames[id] || id}: ${n}`), ''] : []),
    ...(hooks.length ? ['By form:', ...hooks.map(([id, n]) => `  ${hookNames[id] || id}: ${n}`), ''] : []),
    ...(sources.length ? ['Top sources:', ...sources.map(([s, n]) => `  ${s}: ${n}`), ''] : []),
    ...(dead.length ? ['Failed steps:', ...Object.entries(deadByType).map(([t, n]) => `  ${t}: ${n}`), ''] : []),
    APP_URL,
  ];
  return {subject: `Website leads digest — ${label}: ${leads} lead${leads === 1 ? '' : 's'}`, html, text: lines.join('\n'), leads, dead: dead.length};
}

/** Send yesterday's digest once (marker in wh_settings/digest_state). */
export async function sendDailyDigest(now = Date.now()) {
  const global = await loadGlobal(true);
  const master = await loadFlow(global.masterFlowId, true);
  const {masterFlowId: _m, defaultFlowId: _d, retentionDays: _r, failureSpikePerHour: _f, ...g} = global;
  void _m; void _d; void _r; void _f;
  const settings = resolveSettings(g, master?.settings);
  const to = settings.emailTo || [];
  if (!to.length) return {sent: false, reason: 'no recipients'};
  const day = nyDay(now - DAY);
  const markerRef = db().collection(WH.settings).doc('digest_state');
  const claimed = await db().runTransaction(async (tx) => {
    const s = await tx.get(markerRef);
    if (s.get('lastDay') === day) return false;
    tx.set(markerRef, {lastDay: day, claimedAt: Date.now()}, {merge: true});
    return true;
  });
  if (!claimed) return {sent: false, reason: 'already sent'};
  try {
    const d = await buildDigest(day);
    const r = await sendMail(settings, {to, cc: settings.emailCc, bcc: settings.emailBcc, subject: d.subject, html: d.html, text: d.text});
    await markerRef.set({lastDay: day, sentAt: Date.now(), messageId: r.messageId}, {merge: true});
    return {sent: true, day};
  } catch (e) {
    await markerRef.set({lastDay: admin.firestore.FieldValue.delete(), lastError: String(e)}, {merge: true});
    logger.error('wh digest failed', e);
    return {sent: false, reason: String(e)};
  }
}

export const whMaintenance = onSchedule({schedule: 'every day 03:15', timeZone: 'America/New_York', timeoutSeconds: 540, memory: '512MiB'}, async () => {
  const global = await loadGlobal(true);
  const retention = await runRetention(Number(global.retentionDays) || 0).catch((e) => {
    logger.error('wh retention failed', e);
    return null;
  });
  const rate = await purgeRate().catch((e) => {
    logger.error('wh rate purge failed', e);
    return -1;
  });
  const digest = await sendDailyDigest();
  logger.info('wh maintenance', {retention, rate, digest});
});
