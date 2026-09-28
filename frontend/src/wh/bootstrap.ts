/** Webhook Flows — one-click setup of the global settings, Master Flow, default flow and email templates. */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { writeAudit } from '../mp/audit';
import type { MpProfile } from '../mp/types';
import { saveWh, patchWh } from './data';
import { WH } from './types';
import type { FlowStep, WhEmailTemplate, WhFlow, WhGlobalSettings } from './types';
import { newStep } from './steps';
import {
  AUTO_REPLY_HTML, AUTO_REPLY_SUBJECT, AUTO_REPLY_TEXT, DEFAULT_IDS, NEW_LEAD_HTML, NEW_LEAD_SUBJECT, NEW_LEAD_TEXT,
} from './defaults';

/** wh_settings/global, or null when it doesn't exist yet (or can't be read). */
export async function loadGlobal(): Promise<WhGlobalSettings | null> {
  try {
    const s = await getDoc(doc(db, WH.settings, 'global'));
    return s.exists() ? (s.data() as WhGlobalSettings) : null;
  } catch {
    return null;
  }
}

async function exists(col: string, id: string): Promise<boolean> {
  return (await getDoc(doc(db, col, id))).exists();
}

const step = (type: FlowStep['type'], config: Record<string, unknown> = {}, name?: string): FlowStep => {
  const s = newStep(type);
  return { ...s, id: `${type}_1`, name: name || s.name, config: { ...s.config, ...config } };
};

/**
 * Creates whatever is missing (never overwrites): wh_settings/global, the Master Flow ('master'),
 * the "Standard lead flow" template ('standard') and the two default email templates. Admins only.
 */
export async function ensureWhDefaults(
  profile: MpProfile,
): Promise<{ masterFlowId: string; defaultFlowId: string; defaultTemplateId: string }> {
  if (profile?.role !== 'admin') throw new Error('Only an admin can set up Webhook Flows. Ask an admin to open Webhook Flows → Settings.');
  const created: string[] = [];

  if (!(await exists(WH.templates, DEFAULT_IDS.newLeadTemplate))) {
    const t: Omit<WhEmailTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'New lead notification', subject: NEW_LEAD_SUBJECT, htmlBody: NEW_LEAD_HTML, textBody: NEW_LEAD_TEXT,
    };
    await saveWh(WH.templates, t, DEFAULT_IDS.newLeadTemplate);
    created.push('email template "New lead notification"');
  }
  if (!(await exists(WH.templates, DEFAULT_IDS.autoReplyTemplate))) {
    const t: Omit<WhEmailTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'Thanks for contacting us', subject: AUTO_REPLY_SUBJECT, htmlBody: AUTO_REPLY_HTML, textBody: AUTO_REPLY_TEXT,
    };
    await saveWh(WH.templates, t, DEFAULT_IDS.autoReplyTemplate);
    created.push('email template "Thanks for contacting us"');
  }

  const global = await loadGlobal();
  const masterFlowId = global?.masterFlowId || DEFAULT_IDS.masterFlow;
  const defaultFlowId = global?.defaultFlowId || DEFAULT_IDS.standardFlow;
  const defaultTemplateId = global?.emailTemplateId || DEFAULT_IDS.newLeadTemplate;

  if (!(await exists(WH.flows, masterFlowId))) {
    const master: Omit<WhFlow, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'Master Flow',
      type: 'master',
      forwardToMaster: false,
      settings: {},
      steps: [
        step('dedupe', { matchOn: ['email', 'phone1'], windowHours: 24, onDuplicate: 'stop', scope: 'all_sites' }, 'Skip duplicates across all websites'),
        step('dms_sync', { integrationId: 'inherit' }),
        step('sheets', { spreadsheetId: 'inherit' }, 'Add row to master sheet'),
        step('create_lead'),
        step('notify', { uids: [] }),
      ],
    };
    await saveWh(WH.flows, master, masterFlowId);
    created.push('Master Flow');
  }

  if (!(await exists(WH.flows, defaultFlowId))) {
    const standard: Omit<WhFlow, 'id' | 'createdAt' | 'updatedAt'> = {
      name: 'Standard lead flow',
      type: 'template',
      forwardToMaster: true,
      settings: {},
      steps: [
        step('validate', { required: [] }),
        step('dedupe', { matchOn: ['email', 'phone1'], windowHours: 24, onDuplicate: 'stop' }),
        step('email'),
        step('sheets', { spreadsheetId: 'inherit' }),
        step('ga4', { event: 'generate_lead' }),
        step('forward_to_master'),
      ],
    };
    await saveWh(WH.flows, standard, defaultFlowId);
    created.push('flow "Standard lead flow"');
  }

  if (!global) {
    const g: WhGlobalSettings = {
      masterFlowId,
      defaultFlowId,
      retentionDays: 365,
      requiredFields: [],
      dedupeWindowHours: 24,
      dedupeMatchOn: ['email', 'phone1'],
      spam: { honeypotField: 'website', perIpPerMinute: 10, perKeyPerMinute: 120, blockedIps: [], blockedWords: [] },
      alertNoLeadsDays: 3,
      failureSpikePerHour: 20,
      emailTemplateId: defaultTemplateId,
      autoReplyEnabled: false,
      autoReplyTemplateId: DEFAULT_IDS.autoReplyTemplate,
    };
    await saveWh(WH.settings, g as Record<string, unknown>, 'global');
    created.push('global settings');
  } else {
    const patch: Partial<WhGlobalSettings> = {};
    if (!global.masterFlowId) patch.masterFlowId = masterFlowId;
    if (!global.defaultFlowId) patch.defaultFlowId = defaultFlowId;
    if (!global.emailTemplateId) patch.emailTemplateId = defaultTemplateId;
    if (Object.keys(patch).length) {
      await patchWh(WH.settings, 'global', patch as Record<string, unknown>);
      created.push(`global settings (${Object.keys(patch).join(', ')})`);
    }
  }

  if (created.length) await writeAudit(profile, 'wh_setup_defaults', 'wh_settings/global', `Created ${created.join(', ')}`);
  return { masterFlowId, defaultFlowId, defaultTemplateId };
}
