// Webhook Flows — pure helpers shared by the admin UI and the Cloud Functions.
// KEEP IN SYNC with functions/src/wh/shared.ts (identical copy below the header).
import {LEAD_FIELDS, TRACKING_FIELDS} from './types';
import type {WhSettings} from './types';

// ---------------------------------------------------------------------------
// Settings cascade: global → master flow → domain → webhook flow → webhook (most specific wins)
// ---------------------------------------------------------------------------

const LIST_KEYS = ['emailTo', 'emailCc', 'emailBcc'] as const;

const isSet = (v: unknown) =>
  v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

/** Merge settings layers, least specific first. Empty values inherit; `spam` is merged key by key. */
export function resolveSettings(...layers: Array<WhSettings | undefined | null>): WhSettings {
  const out: WhSettings = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer) as Array<[keyof WhSettings, unknown]>) {
      if (!isSet(v)) continue;
      if (k === 'spam' && typeof v === 'object') {
        const spam: Record<string, unknown> = {...(out.spam || {})};
        for (const [sk, sv] of Object.entries(v as object)) if (isSet(sv)) spam[sk] = sv;
        out.spam = spam;
      } else if ((LIST_KEYS as readonly string[]).includes(k) && layer.emailInheritMode === 'add') {
        const prev = (out[k] as string[] | undefined) || [];
        (out as Record<string, unknown>)[k] = Array.from(new Set([...prev, ...(v as string[])]));
      } else {
        (out as Record<string, unknown>)[k] = v;
      }
    }
  }
  delete out.emailInheritMode;
  return out;
}

// ---------------------------------------------------------------------------
// Merge tags: {{field}}, {{{field}}} (no escaping), {{#if field}}…{{else}}…{{/if}}, {{all_fields_table}}
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  form_name: 'Form', first_name: 'First name', last_name: 'Last name', phone1: 'Phone', phone2: 'Phone 2',
  address: 'Address', email: 'Email', zip_code: 'ZIP code', model: 'Model', brand: 'Brand',
  vin_number: 'VIN', sku_number: 'SKU', user_ip: 'IP address', url: 'Page URL', comments: 'Comments',
  image_1: 'Image 1', image_2: 'Image 2', image_3: 'Image 3',
  utm_source: 'UTM source', utm_medium: 'UTM medium', utm_campaign: 'UTM campaign', utm_term: 'UTM term',
  utm_content: 'UTM content', gclid: 'Google click id', fbclid: 'Facebook click id', ga_client_id: 'GA client id',
  referrer: 'Referrer', user_agent: 'Browser',
};
export const fieldLabel = (f: string) => LABELS[f] || f.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Merge-tag values: every field as a string. Extra keys (domain_name, submitted_at, lead_url…) are allowed. */
export type MergeData = Record<string, string | undefined>;

/** Fields in display order: standard, tracking, then any extras (non-empty only). */
export function orderedFields(data: MergeData): string[] {
  const std = [...LEAD_FIELDS, ...TRACKING_FIELDS] as readonly string[];
  const extras = Object.keys(data).filter((k) => !std.includes(k) && !k.startsWith('_')).sort();
  return [...std, ...extras].filter((k) => isSet(data[k]));
}

const isImageUrl = (v: string) => /^https?:\/\//.test(v) && /(\.(png|jpe?g|gif|webp|heic)(\?|$))|wh_uploads/i.test(v);

export function allFieldsTable(data: MergeData, html: boolean): string {
  const keys = orderedFields(data).filter((k) => !['domain_name', 'submitted_at', 'lead_url', 'webhook_name'].includes(k));
  if (!html) return keys.map((k) => `${fieldLabel(k)}: ${data[k]}`).join('\n');
  const rows = keys.map((k) => {
    const v = String(data[k]);
    const cell = isImageUrl(v) ?
      `<a href="${escapeHtml(v)}"><img src="${escapeHtml(v)}" alt="${escapeHtml(fieldLabel(k))}" style="max-width:240px;border-radius:6px"></a>` :
      /^https?:\/\//.test(v) ? `<a href="${escapeHtml(v)}">${escapeHtml(v)}</a>` : escapeHtml(v).replace(/\n/g, '<br>');
    return `<tr><td style="padding:6px 10px;border:1px solid #ddd;background:#f6f6f6;font-weight:600;vertical-align:top">${escapeHtml(fieldLabel(k))}</td>` +
      `<td style="padding:6px 10px;border:1px solid #ddd">${cell}</td></tr>`;
  });
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${rows.join('')}</table>`;
}

/** Render a template. `html` = escape values and build an HTML table for {{all_fields_table}}. */
export function renderTemplate(tpl: string, data: MergeData, html: boolean): string {
  // Conditionals, innermost first so nesting works.
  const ifRe = /\{\{#if\s+([\w.]+)\s*\}\}((?:(?!\{\{#if)[\s\S])*?)\{\{\/if\}\}/;
  let out = tpl;
  for (let guard = 0; guard < 200 && ifRe.test(out); guard++) {
    out = out.replace(ifRe, (_m, field: string, body: string) => {
      const [yes, no = ''] = body.split(/\{\{else\}\}/);
      return isSet(data[field]) ? yes : no;
    });
  }
  out = out.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, f: string) => String(data[f] ?? ''));
  return out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, f: string) => {
    if (f === 'all_fields_table') return allFieldsTable(data, html);
    const v = String(data[f] ?? '');
    return html ? escapeHtml(v) : v;
  });
}

/** Evaluate a condition step's test. */
export function testCondition(value: unknown, op: string, expected: unknown): boolean {
  const v = value === undefined || value === null ? '' : String(value);
  const e = expected === undefined || expected === null ? '' : String(expected);
  const lv = v.toLowerCase();
  const le = e.toLowerCase();
  switch (op) {
  case '==': return lv === le;
  case '!=': return lv !== le;
  case 'contains': return lv.includes(le);
  case 'not_contains': return !lv.includes(le);
  case 'starts_with': return lv.startsWith(le);
  case 'empty': return !v.trim();
  case 'not_empty': return !!v.trim();
  case '>': return Number(v) > Number(e);
  case '<': return Number(v) < Number(e);
  default: return false;
  }
}

/** Sample submission used by previews, test sends and the "Send test" button. */
export const SAMPLE_LEAD: MergeData = {
  form_name: 'Contact form', first_name: 'Jane', last_name: 'Sample', phone1: '(555) 010-2000',
  email: 'jane.sample@example.com', zip_code: '19104', model: 'Tigon Blaze 4', brand: 'TIGON',
  comments: 'Is this cart still available? Looking to buy this week.', url: 'https://example.com/contact',
  user_ip: '203.0.113.7', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'spring-sale',
  domain_name: 'Example Dealer', submitted_at: new Date(0).toISOString(),
};

/** 32-char URL-safe random key (unguessable webhook id). */
export function randomKey(len = 32): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
