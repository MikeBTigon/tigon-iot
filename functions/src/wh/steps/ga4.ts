// Webhook Flows — GA4 Measurement Protocol (server-side "generate_lead" event; no personal data is sent).
import {createHash} from 'crypto';
import type {StepContext, StepResult} from '../engineTypes';
import {bodySnippet, errMsg, fail, fetchWithTimeout, httpRetryable, isTestSubmission, skip} from './util';

const MP_HOST = 'https://www.google-analytics.com';

/** GA client id from the embed snippet, or a stable pseudo id derived from the submission id. */
export function ga4ClientId(submissionId: string, gaClientId: unknown, receivedAt: number): string {
  const g = typeof gaClientId === 'string' ? gaClientId.trim().replace(/^GA\d\.\d\./, '') : '';
  if (/^\d+\.\d+$/.test(g)) return g;
  const n = parseInt(createHash('sha256').update(submissionId).digest('hex').slice(0, 8), 16) % 2147483647;
  return `${n}.${Math.floor((receivedAt || Date.now()) / 1000)}`;
}

export function ga4Payload(ctx: StepContext) {
  const s = ctx.submission;
  const c = ctx.step.config || {};
  const event = typeof c.event === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(c.event) ? c.event : 'generate_lead';
  const params: Record<string, string | number> = {
    form_name: s.form_name || ctx.webhook?.formName || '',
    domain: ctx.domain?.name || '',
    webhook_id: s.webhookId || '',
    page_location: (s.url || '').slice(0, 420),
    source: s.utm_source || '',
    medium: s.utm_medium || '',
    campaign: s.utm_campaign || '',
    currency: 'USD',
    value: 0,
    engagement_time_msec: 1,
  };
  for (const k of Object.keys(params)) if (params[k] === '') delete params[k];
  for (const k of Object.keys(params)) if (typeof params[k] === 'string') params[k] = (params[k] as string).slice(0, 100);
  if (s.url) params.page_location = s.url.slice(0, 420);
  const receivedAt = Number(s.receivedAt) || Date.now();
  const body: Record<string, unknown> = {
    client_id: ga4ClientId(s.id, s.ga_client_id, receivedAt),
    events: [{name: event, params}],
  };
  // GA4 accepts back-dated events up to 72 hours; older replays are sent "now".
  if (Date.now() - receivedAt < 71 * 3600 * 1000) body.timestamp_micros = receivedAt * 1000;
  return body;
}

export async function ga4Step(ctx: StepContext): Promise<StepResult> {
  if (isTestSubmission(ctx.submission)) return skip('test submission');
  const id = ctx.settings.ga4MeasurementId;
  const secret = ctx.settings.ga4ApiSecret;
  if (!id || !secret) return skip('GA4 measurement id / API secret not set');
  const debug = ctx.step.config?.debug === true;
  const url = `${MP_HOST}${debug ? '/debug' : ''}/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`;
  const body = ga4Payload(ctx);
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}, 10000);
  } catch (e) {
    return fail(`GA4 request failed: ${errMsg(e)}`, true);
  }
  if (!res.ok) return fail(`GA4 returned HTTP ${res.status}: ${await bodySnippet(res, 200)}`, httpRetryable(res.status), {status: res.status});
  const response: Record<string, unknown> = {status: res.status, event: (body.events as any[])[0].name, clientId: body.client_id};
  if (debug) {
    try {
      const j = JSON.parse(await res.text());
      response.validationMessages = (j.validationMessages || []).slice(0, 10);
    } catch {
      response.validationMessages = [];
    }
  }
  return {status: 'success', response};
}
