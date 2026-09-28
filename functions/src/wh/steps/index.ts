// Webhook Flows — integration step handlers (email, Google Sheets, GA4, DMS, outgoing webhook, CRM lead, IoT notify).
import type {StepType} from '../types';
import type {StepHandler} from '../engineTypes';
import {emailStep} from './email';
import {sheetsStep} from './sheets';
import {ga4Step} from './ga4';
import {dmsStep} from './dms';
import {webhookOutStep} from './webhookOut';
import {createLeadStep, notifyStep} from './lead';

export {sendMail, whTestEmail} from './email';
export {flushSheetBuffer} from './sheets';

export const INTEGRATION_STEPS: Partial<Record<StepType, StepHandler>> = {
  email: emailStep,
  sheets: sheetsStep,
  ga4: ga4Step,
  dms_sync: dmsStep,
  webhook_out: webhookOutStep,
  create_lead: createLeadStep,
  notify: notifyStep,
};
