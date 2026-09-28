// Webhook Flows — send the lead to another system (POST/PUT JSON or form), optionally HMAC-signed.
import {createHmac} from 'crypto';
import {promises as dns} from 'dns';
import {isIP} from 'net';
import type {StepContext, StepResult} from '../engineTypes';
import {bodySnippet, ctxMergeData, errMsg, fail, fetchWithTimeout, httpRetryable} from './util';

/** true for loopback, private, link-local, CGNAT, multicast/reserved and unspecified addresses. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    const hex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (/^::ffff:/.test(s) || /^64:ff9b:/.test(s)) return true;
    return /^(fc|fd|fe[89ab]|ff)/.test(s);
  }
  return false;
}

const BLOCKED_HOSTS = /^(localhost|.*\.localhost|metadata|metadata\.google\.internal|.*\.internal|.*\.local)$/i;

/** Returns an error message when the URL may not be called, else ''. */
export async function checkOutboundUrl(raw: unknown): Promise<string> {
  if (typeof raw !== 'string' || !raw.trim()) return 'No URL set for this step.';
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return `"${raw.slice(0, 100)}" is not a valid URL.`;
  }
  if (u.protocol !== 'https:') return 'The URL must start with https://';
  if (u.username || u.password) return 'Put credentials in headers, not in the URL.';
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTS.test(host) || isPrivateIp(host)) return `Sending to internal/private addresses (${host}) is not allowed.`;
  if (!isIP(host)) {
    try {
      const addrs = await dns.lookup(host, {all: true});
      const bad = addrs.find((a) => isPrivateIp(a.address));
      if (bad) return `${host} points to a private address (${bad.address}); not allowed.`;
    } catch {
      // Unresolvable: let the request itself fail (retryable) rather than guessing.
    }
  }
  return '';
}

export function outboundBody(ctx: StepContext, format: 'json' | 'form'): {body: string; contentType: string} {
  const data = ctxMergeData(ctx);
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && !['domain_name', 'domain_url', 'webhook_name', 'submitted_at', 'submission_id', 'lead_url'].includes(k)) fields[k] = v;
  }
  const meta = {
    submission_id: ctx.submission.id,
    domain: ctx.domain?.name || '',
    form_name: data.form_name || '',
    received_at: new Date(Number(ctx.submission.receivedAt) || Date.now()).toISOString(),
  };
  if (format === 'form') {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({...fields, ...meta})) p.append(k, v);
    return {body: p.toString(), contentType: 'application/x-www-form-urlencoded'};
  }
  return {body: JSON.stringify({...fields, meta}), contentType: 'application/json'};
}

const RESERVED_HEADERS = /^(host|content-length|connection|transfer-encoding|x-tigon-signature|x-tigon-timestamp|x-tigon-delivery)$/i;

export async function webhookOutStep(ctx: StepContext): Promise<StepResult> {
  const c = ctx.step.config || {};
  const bad = await checkOutboundUrl(c.url);
  if (bad) return fail(bad, false);
  const url = String(c.url).trim();
  const method = c.method === 'PUT' ? 'PUT' : 'POST';
  const format = c.format === 'form' ? 'form' : 'json';
  const {body, contentType} = outboundBody(ctx, format);
  const headers: Record<string, string> = {'Content-Type': contentType, 'User-Agent': 'TIGON-IOT-Webhook-Flows/1.0',
    'X-Tigon-Delivery': ctx.runId, 'Idempotency-Key': ctx.runId};
  if (c.headers && typeof c.headers === 'object') {
    for (const [k, v] of Object.entries(c.headers as Record<string, unknown>)) {
      if (/^[A-Za-z0-9-]{1,64}$/.test(k) && !RESERVED_HEADERS.test(k) && typeof v === 'string') headers[k] = v.replace(/[\r\n]/g, '');
    }
  }
  if (typeof c.secret === 'string' && c.secret) {
    headers['X-Tigon-Signature'] = 'sha256=' + createHmac('sha256', c.secret).update(body).digest('hex');
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {method, headers, body, redirect: 'manual'}, 10000);
  } catch (e) {
    return fail(`Request failed: ${errMsg(e)}`, true);
  }
  const snippet = await bodySnippet(res, 300);
  const response = {status: res.status, bodySnippet: snippet};
  if (res.status >= 300 && res.status < 400) return fail(`The URL redirected (HTTP ${res.status}); use the final URL.`, false, response);
  if (!res.ok) return fail(`HTTP ${res.status}: ${snippet.slice(0, 200)}`, httpRetryable(res.status), response);
  return {status: 'success', response};
}
