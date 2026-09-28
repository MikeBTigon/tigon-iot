/** Webhook Flows — step catalogue: labels, icons, defaults and one-line summaries. */
import React from 'react';
import {
  CallMerge, CallSplit, ContentCopy, Email, FactCheck, Insights, NotificationsActive, PersonAdd, Schedule, Sync,
  TableChart, Webhook,
} from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';
import type { ConditionOp, FlowStep, StepType } from './types';
import { fieldLabel } from './shared';

const icon = (C: SvgIconComponent) => React.createElement(C, { fontSize: 'small' });

export const STEP_TYPES: StepType[] = [
  'validate', 'dedupe', 'condition', 'email', 'sheets', 'ga4', 'dms_sync', 'webhook_out', 'delay', 'create_lead',
  'notify', 'forward_to_master',
];

export const STEP_META: Record<StepType, { label: string; description: string; icon: React.ReactNode }> = {
  validate: {
    label: 'Check required fields',
    description: 'Stops the lead if required fields are missing (it always needs an email or a phone number).',
    icon: icon(FactCheck),
  },
  dedupe: {
    label: 'Skip duplicates',
    description: 'Detects the same person submitting again within a time window (matched on email/phone).',
    icon: icon(ContentCopy),
  },
  condition: {
    label: 'If / then',
    description: 'Checks a field (e.g. "model contains Blaze") and continues, stops, or jumps to another step.',
    icon: icon(CallSplit),
  },
  email: {
    label: 'Send email',
    description: 'Emails the lead to your team using an email template (and optionally a thank-you to the customer).',
    icon: icon(Email),
  },
  sheets: {
    label: 'Add row to Google Sheet',
    description: 'Appends the lead as a row in a Google Sheet (written in small batches every minute).',
    icon: icon(TableChart),
  },
  ga4: {
    label: 'Google Analytics event',
    description: 'Sends a conversion event (default "generate_lead") to Google Analytics 4.',
    icon: icon(Insights),
  },
  dms_sync: {
    label: 'Send to DMS',
    description: 'Delivers the lead to your dealer management system (ADF/XML or JSON, by web or email).',
    icon: icon(Sync),
  },
  webhook_out: {
    label: 'Send to another app (webhook)',
    description: 'Posts the lead to any URL, e.g. Zapier, Make or your own server.',
    icon: icon(Webhook),
  },
  delay: {
    label: 'Wait',
    description: 'Pauses the flow for some minutes before the next step.',
    icon: icon(Schedule),
  },
  create_lead: {
    label: 'Create CRM lead',
    description: 'Creates a lead in TIGON IOT Leads and assigns it to a salesperson.',
    icon: icon(PersonAdd),
  },
  notify: {
    label: 'Phone notification',
    description: 'Sends a push notification to selected team members in the TIGON IOT app.',
    icon: icon(NotificationsActive),
  },
  forward_to_master: {
    label: 'Hand off to Master Flow',
    description: 'Passes the lead to the Master Flow now (otherwise it happens automatically at the end).',
    icon: icon(CallMerge),
  },
};

export const CONDITION_OPS: Array<{ value: ConditionOp; label: string; needsValue: boolean }> = [
  { value: '==', label: 'is', needsValue: true },
  { value: '!=', label: 'is not', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'not_contains', label: 'does not contain', needsValue: true },
  { value: 'starts_with', label: 'starts with', needsValue: true },
  { value: 'empty', label: 'is empty', needsValue: false },
  { value: 'not_empty', label: 'is not empty', needsValue: false },
  { value: '>', label: 'is greater than', needsValue: true },
  { value: '<', label: 'is less than', needsValue: true },
];

/** Short random step id (unique within a flow). */
export function newStepId(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return 's_' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const DEFAULT_CONFIG: Record<StepType, () => Record<string, unknown>> = {
  validate: () => ({ required: [] }),
  dedupe: () => ({ matchOn: ['email', 'phone1'], windowHours: 24, onDuplicate: 'stop' }),
  condition: () => ({ field: 'model', op: 'not_empty', value: '', then: 'continue', else: 'continue' }),
  email: () => ({}),
  sheets: () => ({ spreadsheetId: 'inherit' }),
  ga4: () => ({ event: 'generate_lead', debug: false }),
  dms_sync: () => ({ integrationId: 'inherit' }),
  webhook_out: () => ({ url: '', method: 'POST', format: 'json', headers: {} }),
  delay: () => ({ minutes: 5 }),
  create_lead: () => ({}),
  notify: () => ({ uids: [], text: 'New lead from {{domain_name}}: {{first_name}} {{last_name}}' }),
  forward_to_master: () => ({}),
};

/** A new, enabled step of this type with sensible defaults. */
export function newStep(type: StepType): FlowStep {
  return { id: newStepId(), type, name: STEP_META[type].label, enabled: true, config: DEFAULT_CONFIG[type]() };
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const fields = (v: unknown) => list(v).map(fieldLabel).join(', ');
const target = (t: unknown) => (t === 'stop' ? 'stop' : t === 'continue' || !t ? 'continue' : 'jump to another step');

/** One-line, plain-English summary shown on the step card. */
export function describeStep(step: FlowStep): string {
  const c = step.config || {};
  switch (step.type) {
  case 'validate': {
    const r = fields(c.required);
    return r ? `Requires: ${r} (plus email or phone)` : 'Uses the required fields from settings (always needs email or phone)';
  }
  case 'dedupe': {
    const on = fields(c.matchOn) || 'settings default';
    const hrs = c.windowHours ? `${c.windowHours} h` : 'settings default window';
    return `Match on ${on} within ${hrs}; duplicates ${c.onDuplicate === 'continue' ? 'are marked but continue' : 'stop here'}`;
  }
  case 'condition': {
    const op = CONDITION_OPS.find((o) => o.value === c.op);
    const val = op?.needsValue ? ` "${String(c.value ?? '')}"` : '';
    return `If ${fieldLabel(String(c.field || '?'))} ${op?.label || c.op}${val} → ${target(c.then)}, otherwise → ${target(c.else)}`;
  }
  case 'email': {
    const to = list(c.to);
    const who = to.length ? to.join(', ') : 'the recipients from settings';
    return `Email ${who}${c.templateId && c.templateId !== 'inherit' ? ' with a chosen template' : ''}${c.autoReply ? ' + customer thank-you' : ''}`;
  }
  case 'sheets':
    return !c.spreadsheetId || c.spreadsheetId === 'inherit' ?
      `Add a row to the sheet from settings${c.tab ? ` (tab "${c.tab}")` : ''}` :
      `Add a row to a specific sheet${c.tab ? ` (tab "${c.tab}")` : ''}`;
  case 'ga4':
    return `Send "${String(c.event || 'generate_lead')}" to Google Analytics${c.debug ? ' (debug mode)' : ''}`;
  case 'dms_sync':
    return !c.integrationId || c.integrationId === 'inherit' ? 'Send to the DMS chosen in settings' : 'Send to a specific DMS connection';
  case 'webhook_out':
    return c.url ? `${String(c.method || 'POST')} ${String(c.format || 'json').toUpperCase()} to ${String(c.url)}` : 'No URL set yet';
  case 'delay': {
    const m = Number(c.minutes) || 0;
    return `Wait ${m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minute${m === 1 ? '' : 's'}`}`;
  }
  case 'create_lead':
    return `${c.ownerUid ? 'Create a CRM lead for a chosen salesperson' : 'Create a CRM lead (owner from settings)'}${c.force ? ', always' : ''}`;
  case 'notify': {
    const n = list(c.uids).length;
    return n ? `Notify ${n} team member${n === 1 ? '' : 's'}` : 'Notify the people chosen in settings';
  }
  case 'forward_to_master':
    return 'Continue in the Master Flow';
  default:
    return '';
  }
}
