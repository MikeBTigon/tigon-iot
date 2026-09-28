/** Webhook Flows — CSV export helpers. */
import { LEAD_FIELDS, TRACKING_FIELDS } from './types';
import type { WhSubmission, WhWebhook } from './types';
import { hookUrl } from './data';

const cell = (v: unknown): string => {
  let s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Stop spreadsheet apps from running a value as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Save text as a file in the browser (BOM added for CSV so Excel reads UTF-8). */
export function downloadFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const body = mime.startsWith('text/csv') ? `${String.fromCharCode(0xfeff)}${content}` : content;
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : '');
export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

export function submissionsCsv(rows: WhSubmission[], domainName: (id: string) => string, formName: (id: string) => string): string {
  const std = [...LEAD_FIELDS, ...TRACKING_FIELDS];
  const headers = ['id', 'received_at', 'status', 'website', 'form', ...std, 'is_spam', 'spam_reason', 'is_duplicate', 'duplicate_of',
    'dms_lead_id', 'mp_lead_id', 'domain_id', 'webhook_id', 'flow_id', 'processed_at'];
  return toCsv(headers, rows.map((s) => [
    s.id, iso(s.receivedAt), s.status, domainName(s.domainId), formName(s.webhookId), ...std.map((f) => s[f] ?? ''),
    s.isSpam ? 'yes' : '', s.spamReason || '', s.isDuplicate ? 'yes' : '', s.duplicateOf || '', s.dmsLeadId || '', s.mpLeadId || '',
    s.domainId, s.webhookId, s.flowId, iso(s.processedAt),
  ]));
}

export function webhooksCsv(rows: WhWebhook[], domainName: (id: string) => string, flowName: (id: string) => string): string {
  const headers = ['id', 'website', 'form', 'status', 'flow', 'endpoint_url', 'email_to', 'sheet_id', 'hmac_required', 'last_received_at', 'created_at', 'domain_id', 'flow_id'];
  return toCsv(headers, rows.map((w) => [
    w.id, domainName(w.domainId), w.formName, w.status, flowName(w.flowId), hookUrl(w.key), (w.settings?.emailTo || []).join('; '),
    w.settings?.sheetId || '', w.hmacRequired ? 'yes' : '', iso(w.lastReceivedAt), iso(w.createdAt), w.domainId, w.flowId,
  ]));
}
