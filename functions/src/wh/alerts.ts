// Webhook Flows — hourly alerts: websites with no leads, and step-failure spikes.
// Alerts land in mp_alerts and as IoT notifications (→ phone push). State: wh_settings/alert_state.
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {WH} from './types';
import type {WhDomain, WhWebhook} from './types';
import {resolveSettings} from './shared';
import {db, loadFlow, loadGlobal} from './config';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A website must go this long without a lead before anyone is told (shorter settings are raised to this). */
export const NO_LEADS_MIN_DAYS = 180;

/** mp_alerts doc (same shape as mpOps raiseAlert) + an IoT notification per recipient. */
export async function raiseWhAlert(alert: Record<string, unknown> & {kind: string; text: string}, notifyUids?: string[]) {
  const now = Date.now();
  const ref = await db().collection('mp_alerts').add({...alert, source: 'webhook_flows', createdAt: now});
  let uids = (notifyUids || []).filter(Boolean);
  if (!uids.length) {
    const managers = await db().collection('mp_users').where('role', 'in', ['admin', 'manager']).get();
    uids = managers.docs.map((d) => d.id);
  }
  const batch = db().batch();
  for (const uid of Array.from(new Set(uids)).slice(0, 400)) {
    batch.set(db().collection('notifications').doc(), {
      targetUserId: uid,
      sourceDeviceName: 'Webhook Flows',
      text: alert.text,
      isHandled: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'wh_alert',
      alertId: ref.id,
    });
  }
  await batch.commit();
  return ref.id;
}

interface AlertState {
  noLeads?: Record<string, number>;
  /** Website id → the last lead time it was alerted for (0 = never had one): one alert per quiet stretch. */
  noLeadsFor?: Record<string, number>;
  noLeadsCleanup?: number;
  failureSpikeAt?: number;
}

/** Run both checks. Exported for tests. */
export async function runAlerts(now = Date.now()) {
  const stateRef = db().collection(WH.settings).doc('alert_state');
  const state = ((await stateRef.get()).data() || {}) as AlertState;
  const noLeads: Record<string, number> = {...(state.noLeads || {})};
  const noLeadsFor: Record<string, number> = {...(state.noLeadsFor || {})};

  // One-time: remove the old short-window "no leads" alerts (they repeated daily for every quiet website).
  if (!state.noLeadsCleanup) {
    for (;;) {
      const old = await db().collection('mp_alerts').where('kind', '==', 'wh_no_leads').limit(400).get();
      if (old.empty) break;
      const b = db().batch();
      old.docs.forEach((x) => b.delete(x.ref));
      await b.commit();
      if (old.size < 400) break;
    }
    const notes = await db().collection('notifications').where('source', '==', 'wh_alert').limit(10000).get();
    const mine = notes.docs.filter((x) => String(x.get('text') || '').startsWith('No website leads'));
    for (let i = 0; i < mine.length; i += 400) {
      const b = db().batch();
      mine.slice(i, i + 400).forEach((x) => b.delete(x.ref));
      await b.commit();
    }
    state.noLeadsCleanup = now;
  }
  const global = await loadGlobal(true);
  const master = await loadFlow(global.masterFlowId, true);
  const raised: string[] = [];

  // (a) No leads for N days
  const domains = await db().collection(WH.domains).where('status', '==', 'active').limit(5000).get();
  for (const d of domains.docs) {
    const domain = {...d.data(), id: d.id} as WhDomain & {lastReceivedAt?: number};
    const settings = resolveSettings(global, master?.settings, domain.settings);
    const set = domain.settings?.alertNoLeadsDays ?? global.alertNoLeadsDays ?? NO_LEADS_MIN_DAYS;
    if (!(set > 0)) continue;
    const days = Math.max(set, NO_LEADS_MIN_DAYS);
    const windowStart = now - days * DAY;
    if ((domain.lastReceivedAt || 0) >= windowStart) continue;
    // Candidate: confirm from its webhooks (only active ones count; a domain with none isn't expected to get leads).
    const hooks = await db().collection(WH.webhooks).where('domainId', '==', d.id).limit(200).get();
    const active = hooks.docs.map((h) => h.data() as WhWebhook).filter((h) => h.status === 'active');
    if (!active.length) continue;
    const last = Math.max(domain.lastReceivedAt || 0, ...active.map((h) => h.lastReceivedAt || 0));
    const since = last || Math.max(domain.createdAt || 0, ...active.map((h) => h.createdAt || 0));
    if (since >= windowStart) continue;
    // Only one notification per quiet stretch; a new lead starts a new stretch.
    if (d.id in noLeadsFor && noLeadsFor[d.id] === last) continue;
    const text = last ?
      `No website leads from ${domain.name || domain.url} in ${Math.floor((now - last) / DAY)} days (6+ months). Check that the form still works.` :
      `No website leads from ${domain.name || domain.url} in the 6+ months since it was set up. Check the form is connected.`;
    await raiseWhAlert({kind: 'wh_no_leads', domainId: d.id, lastReceivedAt: last || null, text}, settings.notifyUids);
    noLeads[d.id] = now;
    noLeadsFor[d.id] = last;
    raised.push('wh_no_leads:' + d.id);
  }

  // (b) Failure spike in the last hour
  const threshold = global.failureSpikePerHour ?? 20;
  let failures = 0;
  if (threshold > 0 && now - (state.failureSpikeAt || 0) >= 3 * HOUR) {
    const runs = await db().collection(WH.stepRuns).where('finishedAt', '>=', now - HOUR).limit(2000).get();
    const byType: Record<string, number> = {};
    for (const r of runs.docs) {
      const s = r.get('status');
      if (s === 'failed' || s === 'retrying' || s === 'dead') {
        failures++;
        const t = String(r.get('stepType') || 'step');
        byType[t] = (byType[t] || 0) + 1;
      }
    }
    if (failures > threshold) {
      const top = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${t} ${n}`).join(', ');
      const settings = resolveSettings(global, master?.settings);
      await raiseWhAlert({
        kind: 'wh_failure_spike', failures, threshold, byType,
        text: `Webhook Flows: ${failures} step failures in the last hour (${top}). Check Webhook Flows → Failed steps (tigoniot.com/wh/dead).`,
      }, settings.notifyUids);
      state.failureSpikeAt = now;
      raised.push('wh_failure_spike');
    }
  }

  await stateRef.set({noLeads, noLeadsFor, noLeadsCleanup: state.noLeadsCleanup || 0, failureSpikeAt: state.failureSpikeAt || 0, checkedAt: now}, {merge: true});
  return {raised, failures};
}

/**
 * One-time relabel: CRM leads created by Webhook Flows before websites had a lead channel were saved with
 * channel 'website'; move them to their website's channel (default 'DBA Website'). Runs once (flag doc).
 */
export async function migrateLeadChannels(): Promise<number> {
  const flagRef = db().collection(WH.settings).doc('migrations');
  if ((await flagRef.get()).get('leadChannelV1')) return 0;
  const snap = await db().collection('mp_leads').where('source', '==', 'website').limit(5000).get();
  const domains = new Map<string, string>();
  let n = 0;
  let batch = db().batch();
  for (const d of snap.docs) {
    const domainId = String(d.get('whDomainId') || '');
    if (!d.get('whSubmissionId') || d.get('channel') !== 'website') continue;
    if (domainId && !domains.has(domainId)) {
      domains.set(domainId, String((await db().collection(WH.domains).doc(domainId).get()).get('leadChannel') || ''));
    }
    batch.update(d.ref, {channel: domains.get(domainId) || 'dba_website', updatedAt: Date.now()});
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db().batch();
    }
  }
  await batch.commit();
  await flagRef.set({leadChannelV1: Date.now(), leadChannelV1Count: n}, {merge: true});
  return n;
}

export const whAlerts = onSchedule({schedule: 'every 60 minutes', timeoutSeconds: 300}, async () => {
  const moved = await migrateLeadChannels().catch((e) => {
    logger.warn('wh lead channel migration failed', e);
    return 0;
  });
  if (moved) logger.info('wh lead channels relabeled', {moved});
  const r = await runAlerts();
  if (r.raised.length) logger.info('wh alerts raised', r);
});
