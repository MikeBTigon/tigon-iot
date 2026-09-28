// Webhook Flows steps — shared helpers.
import {LEAD_FIELDS, TRACKING_FIELDS} from '../types';
import type {WhDomain, WhSubmission, WhWebhook} from '../types';
import type {MergeData} from '../shared';
import type {StepContext, StepResult} from '../engineTypes';

export const TZ = 'America/New_York';
export const APP_URL = 'https://tigoniot.com';
export const leadUrl = (submissionId: string) => `${APP_URL}/wh/submissions/${submissionId}`;

/** Arrays or comma/semicolon/newline separated strings → trimmed unique list. */
export function toList(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map((x) => String(x ?? '')) : typeof v === 'string' ? v.split(/[,;\n]/) : [];
  return Array.from(new Set(raw.map((s) => s.trim()).filter(Boolean)));
}

export const isValidEmail = (s: unknown): s is string =>
  typeof s === 'string' && s.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/.test(s.trim());

/** Reserved/example domains we never send to (sample data, tests). */
export const isReservedEmail = (s: string) => /@(.+\.)?(example\.(com|org|net)|test|invalid|localhost)$/i.test(s.trim());

export const isTestSubmission = (s: WhSubmission) => (s as unknown as {isTest?: boolean}).isTest === true;

export function formatNy(ms: number): string {
  if (!ms || !isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(ms));
}

const STD = [...LEAD_FIELDS, ...TRACKING_FIELDS] as readonly string[];
/** Form keys that are never lead data (spam traps, captcha tokens, WordPress internals). */
const JUNK = /^(website|cf-turnstile-response|g-recaptcha-response|h-captcha-response|_.*|action|nonce|form_id|post_id|referer_title|queried_id)$/i;

/** All merge-tag values for a submission: standard + tracking fields, unmapped extras, and meta tags. */
export function mergeDataFor(sub: Partial<WhSubmission>, domain: WhDomain | null, webhook: WhWebhook | null): MergeData {
  const data: MergeData = {};
  const src = sub as Record<string, unknown>;
  for (const f of STD) {
    const v = src[f];
    if (v !== undefined && v !== null && v !== '') data[f] = String(v);
  }
  const mapped = new Set(Object.keys(webhook?.fieldMap || {}));
  const raw = (sub.rawPayload || {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw)) {
    if (STD.includes(k) || mapped.has(k) || JUNK.test(k) || k in data) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      const s = String(v).trim();
      if (s && /^[\w.-]{1,64}$/.test(k)) data[k] = s.slice(0, 2000);
    }
  }
  if (!data.form_name && webhook?.formName) data.form_name = webhook.formName;
  data.domain_name = domain?.name || '';
  data.domain_url = domain?.url || '';
  data.webhook_name = webhook?.formName || data.form_name || '';
  data.submitted_at = formatNy(Number(sub.receivedAt) || Date.now());
  data.submission_id = sub.id || '';
  data.lead_url = sub.id ? leadUrl(sub.id) : APP_URL + '/wh/submissions';
  return data;
}

export const ctxMergeData = (ctx: StepContext) => mergeDataFor(ctx.submission, ctx.domain, ctx.webhook);

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/** 4xx (except 408/429) are permanent; everything else is worth retrying. */
export const httpRetryable = (status: number) => !(status >= 400 && status < 500 && status !== 408 && status !== 429);

export const fail = (error: string, retryable = true, response?: Record<string, unknown>): StepResult =>
  ({status: 'failed', error, retryable, ...(response ? {response} : {})});

export const skip = (reason: string, extra: Record<string, unknown> = {}): StepResult =>
  ({status: 'skipped', response: {reason, ...extra}});

/** fetch with a hard timeout. Throws on network errors / timeout ("timed out after Nms"). */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10000): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {...init, signal: ctl.signal});
  } catch (e) {
    if (ctl.signal.aborted) throw new Error(`timed out after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function bodySnippet(res: Response, n = 300): Promise<string> {
  try {
    return (await res.text()).slice(0, n);
  } catch {
    return '';
  }
}
