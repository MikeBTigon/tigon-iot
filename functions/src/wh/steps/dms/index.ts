// Webhook Flows — DMS sync step: picks the DMS integration and hands the normalized lead to its adapter.
import * as logger from 'firebase-functions/logger';
import {TRACKING_FIELDS} from '../../types';
import type {StepContext, StepResult} from '../../engineTypes';
import {getIntegrationSecrets, pickIntegration} from '../cache';
import {errMsg, fail, isTestSubmission, skip} from '../util';
import {adfAdapter} from './adf';
import {jsonAdapter} from './json';
import type {DmsAdapter, NormalizedLead} from './types';
import {DmsError} from './types';

export type {DmsAdapter, NormalizedLead} from './types';
export {buildAdf, xmlEscape} from './adf';

const ADAPTERS: Record<string, DmsAdapter> = {adf: adfAdapter, json: jsonAdapter};

export function normalizeLead(ctx: StepContext): NormalizedLead {
  const s = ctx.submission;
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
  const model = str(s.model);
  const source: Record<string, string> = {};
  for (const f of TRACKING_FIELDS) if (str(s[f])) source[f] = str(s[f]);
  return {
    submissionId: s.id,
    receivedAt: Number(s.receivedAt) || Date.now(),
    firstName: str(s.first_name), lastName: str(s.last_name), email: str(s.email),
    phone1: str(s.phone1), phone2: str(s.phone2), address: str(s.address), zipCode: str(s.zip_code),
    brand: str(s.brand), model, year: (model.match(/\b(19|20)\d{2}\b/) || [''])[0],
    vin: str(s.vin_number), sku: str(s.sku_number), comments: str(s.comments),
    images: [s.image_1, s.image_2, s.image_3].map(str).filter(Boolean),
    pageUrl: str(s.url), formName: str(s.form_name) || ctx.webhook?.formName || '',
    domainName: ctx.domain?.name || '', domainUrl: ctx.domain?.url || '', source, isTest: isTestSubmission(s),
  };
}

export async function dmsStep(ctx: StepContext): Promise<StepResult> {
  const c = ctx.step.config || {};
  if (isTestSubmission(ctx.submission) && c.sendTests !== true) return skip('test submission');
  if (ctx.settings.dmsEnabled === false) return skip('DMS sync is turned off in settings');
  const integration = await pickIntegration('dms', c.integrationId, ctx.settings.dmsIntegrationId);
  if (!integration) return skip('no DMS integration set up');
  const format = String((integration.config || {}).format || 'adf').toLowerCase();
  const adapter = ADAPTERS[format];
  if (!adapter) return fail(`Unknown DMS format "${format}" on "${integration.name || integration.id}".`, false);
  try {
    const secrets = await getIntegrationSecrets(integration.id);
    const r = await adapter.send(normalizeLead(ctx), ctx, integration, secrets);
    return {
      status: 'success',
      response: {integration: integration.name || integration.id, adapter: adapter.name, leadId: r.leadId, ...r.response},
      ...(r.leadId ? {patch: {dmsLeadId: r.leadId}} : {}),
    };
  } catch (e) {
    if (e instanceof DmsError) return fail(e.message, e.retryable, e.response);
    logger.warn('wh dms adapter crashed', {error: errMsg(e)});
    return fail(errMsg(e), true);
  }
}
