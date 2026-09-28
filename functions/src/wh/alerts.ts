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
  failureSpikeAt?: number;
}

/** Run both checks. Exported for tests. */
export async function runAlerts(now = Date.now()) {
  const stateRef = db().collection(WH.settings).doc('alert_state');
  const state = ((await stateRef.get()).data() || {}) as AlertState;
  const noLeads: Record<string, number> = {...(state.noLeads || {})};
  const global = await loadGlobal(true);
  const master = await loadFlow(global.masterFlowId, true);
  const raised: string[] = [];

  // (a) No leads for N days
  const domains = await db().collection(WH.domains).where('status', '==', 'active').limit(5000).get();
  for (const d of domains.docs) {
    const domain = {...d.data(), id: d.id} as WhDomain & {lastReceivedAt?: number};
    const settings = resolveSettings(global, master?.settings, domain.settings);
    const days = domain.settings?.alertNoLeadsDays ?? global.alertNoLeadsDays ?? 3;
    if (!(days > 0)) continue;
    const windowStart = now - days * DAY;
    if ((domain.lastReceivedAt || 0) >= windowStart) continue;
    if (now - (noLeads[d.id] || 0) < DAY) continue;
    // Candidate: confirm from its webhooks (only active ones count; a domain with none isn't expected to get leads).
    const hooks = await db().collection(WH.webhooks).where('domainId', '==', d.id).limit(200).get();
    const active = hooks.docs.map((h) => h.data() as WhWebhook).filter((h) => h.status === 'active');
    if (!active.length) continue;
    const last = Math.max(domain.lastReceivedAt || 0, ...active.map((h) => h.lastReceivedAt || 0));
    const since = last || Math.max(domain.createdAt || 0, ...active.map((h) => h.createdAt || 0));
    if (since >= windowStart) continue;
    const text = last ?
      `No website leads from ${domain.name || domain.url} in ${Math.floor((now - last) / DAY)} days. Check that the form still works.` :
      `No website leads from ${domain.name || domain.url} yet (${days}+ days since setup). Check the form is connected.`;
    await raiseWhAlert({kind: 'wh_no_leads', domainId: d.id, lastReceivedAt: last || null, text}, settings.notifyUids);
    noLeads[d.id] = now;
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

  await stateRef.set({noLeads, failureSpikeAt: state.failureSpikeAt || 0, checkedAt: now}, {merge: true});
  return {raised, failures};
}

export const whAlerts = onSchedule({schedule: 'every 60 minutes', timeoutSeconds: 300}, async () => {
  const r = await runAlerts();
  if (r.raised.length) logger.info('wh alerts raised', r);
});
