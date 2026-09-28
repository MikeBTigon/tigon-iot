// Webhook Flows — shared HTTP delivery for DMS adapters (auth header / basic auth from secrets, lead id parsing).
import {checkOutboundUrl} from '../webhookOut';
import {bodySnippet, errMsg, fetchWithTimeout, httpRetryable} from '../util';
import {DmsError} from './types';

export function authHeaders(secrets: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {};
  if (secrets.headerName && secrets.headerValue && /^[A-Za-z0-9-]{1,64}$/.test(secrets.headerName)) {
    h[secrets.headerName] = String(secrets.headerValue).replace(/[\r\n]/g, '');
  }
  if (secrets.basicUser) {
    h.Authorization = 'Basic ' + Buffer.from(`${secrets.basicUser}:${secrets.basicPass || ''}`).toString('base64');
  }
  return h;
}

/** Lead id from a JSON ({id|leadId|lead_id|data.id}) or XML (<id>, <leadid>, <lead_id>) response. */
export function parseLeadId(text: string): string | undefined {
  const t = text.trim();
  if (!t) return undefined;
  try {
    const j = JSON.parse(t);
    const v = j?.id ?? j?.leadId ?? j?.lead_id ?? j?.data?.id ?? j?.data?.leadId ?? j?.lead?.id;
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim().slice(0, 120);
  } catch {/* not JSON */}
  const m = t.match(/<(id|leadid|lead_id|leadId)(?:\s[^>]*)?>\s*([^<]{1,120}?)\s*<\/\1>/i);
  return m ? m[2] : undefined;
}

export async function postToDms(url: unknown, body: string, contentType: string, secrets: Record<string, string>, idempotencyKey: string) {
  const bad = await checkOutboundUrl(url);
  if (bad) throw new DmsError(`DMS URL problem: ${bad} Fix it in Settings → Integrations.`, false);
  let res: Response;
  try {
    res = await fetchWithTimeout(String(url).trim(), {
      method: 'POST', redirect: 'manual', body,
      headers: {'Content-Type': contentType, 'User-Agent': 'TIGON-IOT-Webhook-Flows/1.0', 'Idempotency-Key': idempotencyKey, ...authHeaders(secrets)},
    }, 15000);
  } catch (e) {
    throw new DmsError(`Could not reach the DMS: ${errMsg(e)}`, true);
  }
  const text = await bodySnippet(res, 5000);
  const response = {status: res.status, bodySnippet: text.slice(0, 300)};
  if (res.status === 401 || res.status === 403) throw new DmsError(`The DMS rejected the credentials (HTTP ${res.status}).`, false, response);
  if (!res.ok) throw new DmsError(`The DMS returned HTTP ${res.status}: ${text.slice(0, 200)}`, httpRetryable(res.status), response);
  return {leadId: parseLeadId(text), response};
}
