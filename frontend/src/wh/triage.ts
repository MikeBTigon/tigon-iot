// System Triage: every system notification in one list — website/Sheets/flow problems found from live data
// (Webhook Flows "Needs attention") plus the MP Assistant alert log (phones offline, failed posts, DMS sync).
// Deleting a live-data item hides it until something changes (new error, more failed rows, a new lead…);
// deleting an alert removes the alert document.
import { useMemo } from 'react';
import { deleteField, doc, limit, orderBy, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../mp/constants';
import type { MpAlert } from '../mp/types';
import { useWhCollection, useWhDoc } from './data';
import { resolveSettings } from './shared';
import { WH } from './types';
import type { WhStepRun } from './types';
import { DAY_MS, ago, useDomains, useGlobal, useMasterFlow, useWebhooks } from './components/Wh1Hooks';

export const TRIAGE_DOC = 'triage';

export type TriageSeverity = 'error' | 'warning' | 'info';
export type TriageArea = 'Websites' | 'Google Sheets' | 'Flows' | 'Phones' | 'Posting' | 'DMS sync';

export interface TriageItem {
  /** Unique id in the list. */
  id: string;
  /** 'check' = found from live data (delete hides it), 'alert' = mp_alerts document (delete removes it). */
  source: 'check' | 'alert';
  /** check: dismissal key; alert: document id. */
  key: string;
  /** check: changes when the problem changes, so a deleted item comes back. */
  sig: string;
  severity: TriageSeverity;
  area: TriageArea;
  title: string;
  text: string;
  at?: number;
  to?: string;
  /** Hidden by a delete (only checks; shown with "Show deleted"). */
  deleted?: boolean;
}

interface SheetsStatus { id: string; lastError?: string; lastErrorAt?: number; pendingRows?: number; deadRows?: number }
interface TriageDoc { id: string; dismissed?: Record<string, string> }

const ALERT_AREA: Record<MpAlert['kind'], TriageArea> = { device_offline: 'Phones', post_failed: 'Posting', sync_failed: 'DMS sync' };
const ALERT_TITLE: Record<MpAlert['kind'], string> = { device_offline: 'Phone offline', post_failed: 'Post failed', sync_failed: 'DMS sync failed' };

/** Live list of system notifications. `deleted` items are included (flagged) so the triage page can show/restore them. */
export function useSystemTriage(now: number) {
  const global = useGlobal();
  const master = useMasterFlow(global);
  const { rows: domains } = useDomains();
  const { rows: webhooks } = useWebhooks();
  const sheets = useWhDoc<SheetsStatus>(WH.settings, 'sheets_status');
  const triage = useWhDoc<TriageDoc>(WH.settings, TRIAGE_DOC);
  const { rows: dead } = useWhCollection<WhStepRun>(WH.stepRuns, [where('status', '==', 'dead'), limit(500)]);
  const { rows: alerts, error: alertsError } = useWhCollection<MpAlert>(COLLECTIONS.alerts, [orderBy('createdAt', 'desc'), limit(300)]);

  const loading = domains === undefined || webhooks === undefined || global === undefined || alerts === undefined;

  const items = useMemo(() => {
    const out: TriageItem[] = [];
    const check = (i: Omit<TriageItem, 'source' | 'id'>) => out.push({ ...i, source: 'check', id: `c:${i.key}` });

    for (const d of domains || []) {
      if (d.status !== 'active') continue;
      const s = resolveSettings(global || undefined, master?.settings, d.settings);
      const limitDays = s.alertNoLeadsDays ?? 3;
      if (!limitDays) continue;
      const hooks = (webhooks || []).filter((w) => w.domainId === d.id && w.status === 'active');
      if (!hooks.length) continue;
      const last = Math.max(0, ...hooks.map((w) => w.lastReceivedAt || 0));
      const since = last || d.createdAt || 0;
      if (now - since > limitDays * DAY_MS) {
        check({
          key: `noleads-${d.id}`, sig: String(last), severity: 'warning', area: 'Websites', title: d.name || 'Website',
          text: last ? `No leads since ${ago(last, now)}. Check that the form still works.` : `No leads yet (added ${ago(d.createdAt, now)}). Check that the form still works.`,
          at: since || undefined, to: `/wh/websites/${d.id}`,
        });
      }
    }
    if (sheets?.lastError) {
      check({
        key: 'sheets-error', sig: String(sheets.lastErrorAt || sheets.lastError), severity: 'error', area: 'Google Sheets', title: 'Google Sheets error',
        text: `${sheets.lastError} Make sure each sheet is shared with the service account (see Settings).`,
        at: sheets.lastErrorAt, to: '/wh/settings',
      });
    }
    if (sheets && (sheets.deadRows || 0) > 0) {
      check({
        key: 'sheets-dead', sig: String(sheets.deadRows), severity: 'error', area: 'Google Sheets', title: 'Sheet rows not written',
        text: `${sheets.deadRows} sheet row(s) could not be written after several tries.`, to: '/wh/settings',
      });
    }
    if (sheets && (sheets.pendingRows || 0) > 200) {
      // Comes back when the backlog doubles.
      check({
        key: 'sheets-pending', sig: String(Math.floor(Math.log2(sheets.pendingRows || 1))), severity: 'warning', area: 'Google Sheets',
        title: 'Sheet rows waiting', text: `${sheets.pendingRows} rows are waiting to be written to Google Sheets.`, to: '/wh/settings',
      });
    }
    if (dead && dead.length) {
      const newest = Math.max(0, ...dead.map((r) => r.finishedAt || r.startedAt || 0));
      check({
        key: 'dead-letters', sig: `${dead.length}|${newest}`, severity: 'error', area: 'Flows', title: 'Failed steps (dead letters)',
        text: `${dead.length >= 500 ? '500+' : dead.length} step(s) failed for good. Fix the cause, then replay them.`,
        at: newest || undefined, to: '/wh/submissions/failed-steps',
      });
    }
    const dismissed = triage?.dismissed || {};
    for (const i of out) if (dismissed[i.key] === i.sig) i.deleted = true;

    for (const a of alerts || []) {
      out.push({
        id: `a:${a.id}`, source: 'alert', key: a.id, sig: '', severity: a.kind === 'device_offline' ? 'warning' : 'error',
        area: ALERT_AREA[a.kind] || 'Phones', title: ALERT_TITLE[a.kind] || 'Alert', text: a.text, at: a.createdAt,
        to: a.kind === 'device_offline' ? '/devices' : a.kind === 'post_failed' ? '/mp/queue' : undefined,
      });
    }
    return out.sort((x, y) => (y.at || 0) - (x.at || 0));
  }, [domains, webhooks, global, master, sheets, dead, triage, alerts, now]);

  return { items, loading, alertsError };
}

const triageRef = () => doc(db, WH.settings, TRIAGE_DOC);

/** Delete notifications: checks are hidden until they change, alerts are removed. */
export async function deleteTriage(items: TriageItem[], uid: string) {
  const checks = items.filter((i) => i.source === 'check');
  const alerts = items.filter((i) => i.source === 'alert');
  if (checks.length) {
    const dismissed: Record<string, string> = {};
    checks.forEach((i) => { dismissed[i.key] = i.sig; });
    await setDoc(triageRef(), { dismissed, updatedAt: Date.now(), updatedBy: uid }, { merge: true });
  }
  for (let i = 0; i < alerts.length; i += 400) {
    const b = writeBatch(db);
    alerts.slice(i, i + 400).forEach((a) => b.delete(doc(db, COLLECTIONS.alerts, a.key)));
    await b.commit();
  }
}

/** Bring back deleted checks (alerts cannot come back). */
export async function restoreTriage(items: TriageItem[], uid: string) {
  const checks = items.filter((i) => i.source === 'check');
  if (!checks.length) return;
  const dismissed: Record<string, ReturnType<typeof deleteField>> = {};
  checks.forEach((i) => { dismissed[i.key] = deleteField(); });
  await setDoc(triageRef(), { dismissed, updatedAt: Date.now(), updatedBy: uid }, { merge: true });
}
