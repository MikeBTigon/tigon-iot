/**
 * Webhook Flows — copy-paste website code and setup instructions ("Setup Packet").
 * Everything here is pure string building so it can be unit-tested and downloaded as a file.
 */
import { LEAD_FIELDS, TRACKING_FIELDS } from './types';
import { SAMPLE_LEAD, fieldLabel } from './shared';
import { hookUrl } from './data';

export interface SnippetOptions {
  /** Webhook key (the last part of the endpoint URL). */
  key: string;
  /** Override the endpoint (tests); defaults to hookUrl(key). */
  endpoint?: string;
  formName: string;
  siteName?: string;
  siteUrl?: string;
  platform?: string;
  /** Hidden spam-trap input name (settings.spam.honeypotField || 'website'). */
  honeypot?: string;
  thankYouUrl?: string;
  /** Resolved settings.requiredFields. */
  required?: string[];
  /** Incoming name → standard field map configured on the webhook. */
  fieldMap?: Record<string, string>;
  hmacRequired?: boolean;
  ga4MeasurementId?: string;
}

export const PLATFORM_LABELS: Record<string, string> = {
  wordpress: 'WordPress',
  webflow: 'Webflow',
  wix: 'Wix',
  squarespace: 'Squarespace',
  shopify: 'Shopify',
  custom: 'Custom HTML',
};

export const platformLabel = (p?: string) => PLATFORM_LABELS[p || 'custom'] || p || 'Custom HTML';

export const endpointOf = (o: SnippetOptions) => o.endpoint || hookUrl(o.key);
export const honeypotOf = (o: SnippetOptions) => (o.honeypot || 'website').trim() || 'website';
export const formIdOf = (o: SnippetOptions) => `tigon-form-${o.key.slice(0, 8).replace(/[^A-Za-z0-9]/g, '')}`;

/** JSON-encode a value for embedding in a <script> (also safe against "</script>"). */
const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const TRACK_URL_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
/** Hidden fields the script fills in (user_agent and user_ip are captured by the server). */
export const HIDDEN_TRACKING_FIELDS = ['url', 'referrer', ...TRACK_URL_PARAMS, 'ga_client_id'];

// ---------------------------------------------------------------------------
// The browser script (shared by the full form and the "use my existing form" variant)
// ---------------------------------------------------------------------------

function browserScript(o: SnippetOptions, formId: string, existing: boolean): string {
  return `<script>
/* TIGON Webhook Flows — sends this form to ${endpointOf(o)} */
(function () {
  var ENDPOINT = ${js(endpointOf(o))};
  var FORM_ID = ${js(formId)};
  var FORM_NAME = ${js(o.formName || 'Contact form')};
  var HONEYPOT = ${js(honeypotOf(o))};
  var THANK_YOU_URL = ${js(o.thankYouUrl || '')};  // leave "" to show SUCCESS_TEXT instead of redirecting
  var SUCCESS_TEXT = "Thank you! We received your message and will contact you shortly.";
  var ERROR_TEXT = "Sorry, something went wrong. Please try again or call us.";
  ${existing ? `// true = also let the site's own form handler run (the lead is sent in the background).
  var KEEP_SITE_HANDLER = false;` : 'var KEEP_SITE_HANDLER = false;'}
  var MAX_FILE_MB = 10;
  var TRACK = ${js(TRACK_URL_PARAMS)};
  var STORE_KEY = "tigon_first_touch";
  var MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  // First-touch attribution: the first utm_*/gclid/fbclid seen are kept for 30 days.
  function firstTouch() {
    var current = {}, found = false, q;
    try { q = new URLSearchParams(window.location.search); } catch (e) { q = null; }
    TRACK.forEach(function (k) { var v = q && q.get(k); if (v) { current[k] = v; found = true; } });
    var saved = null;
    try { saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || "null"); } catch (e) { saved = null; }
    if (saved && (!saved.ts || Date.now() - saved.ts > MAX_AGE_MS)) saved = null;
    if (!saved && found) {
      saved = { ts: Date.now(), v: current };
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) { /* private mode */ }
    }
    var out = {};
    TRACK.forEach(function (k) { out[k] = (saved && saved.v && saved.v[k]) || current[k] || ""; });
    return out;
  }

  // Google Analytics client id from the _ga cookie: GA1.1.123456.789012 -> 123456.789012
  function gaClientId() {
    var m = document.cookie.match(/(?:^|;\\s*)_ga=([^;]+)/);
    if (!m) return "";
    var parts = decodeURIComponent(m[1]).split(".");
    return parts.length >= 4 ? parts.slice(-2).join(".") : "";
  }

  function tracking() {
    var t = firstTouch();
    t.url = window.location.href;
    t.referrer = document.referrer || "";
    t.ga_client_id = gaClientId();
    return t;
  }

  function fillHidden(form) {
    var t = tracking();
    Object.keys(t).forEach(function (k) {
      var el = form.querySelector('input[type="hidden"][name="' + k + '"]');
      if (el) el.value = t[k];
    });
  }

  // Spam trap: a field people never see. Bots fill it in, so those posts are dropped.
  function ensureHoneypot(form) {
    if (form.querySelector('[name="' + HONEYPOT + '"]')) return;
    var wrap = document.createElement("div");
    wrap.setAttribute("aria-hidden", "true");
    wrap.style.cssText = "position:absolute!important;left:-10000px!important;top:auto;width:1px;height:1px;overflow:hidden";
    var input = document.createElement("input");
    input.type = "text"; input.name = HONEYPOT; input.tabIndex = -1; input.autocomplete = "off"; input.value = "";
    wrap.appendChild(input);
    form.appendChild(wrap);
  }

  function messageBox(form) {
    var el = form.querySelector(".tigon-msg");
    if (!el) {
      el = document.createElement("p");
      el.className = "tigon-msg";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      form.appendChild(el);
    }
    return el;
  }

  function show(form, text, ok) {
    var el = messageBox(form);
    el.textContent = text;
    el.style.color = ok ? "#1b5e20" : "#b71c1c";
    el.style.fontWeight = "600";
  }

  function buildData(form) {
    var fd = new FormData(form);
    // Drop empty file inputs so no blank images are sent; check sizes.
    var files = form.querySelectorAll('input[type="file"]');
    for (var i = 0; i < files.length; i++) {
      var input = files[i];
      if (!input.name) continue;
      if (!input.files || !input.files.length) { fd.delete(input.name); continue; }
      if (input.files[0].size > MAX_FILE_MB * 1024 * 1024) throw new Error("Each photo must be smaller than " + MAX_FILE_MB + " MB.");
    }
    var t = tracking();
    Object.keys(t).forEach(function (k) { if (t[k]) fd.set(k, t[k]); });
    if (!fd.get("form_name")) fd.set("form_name", FORM_NAME);
    if (!fd.has(HONEYPOT)) fd.set(HONEYPOT, "");
    return fd;
  }

  function send(form) {
    var button = form.querySelector('button[type="submit"], input[type="submit"]');
    var label = button ? (button.tagName === "INPUT" ? button.value : button.textContent) : "";
    var fd;
    try { fd = buildData(form); } catch (err) { show(form, err.message, false); return; }
    if (KEEP_SITE_HANDLER) {
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, fd);
      else fetch(ENDPOINT, { method: "POST", body: fd, keepalive: true }).catch(function () {});
      return;
    }
    if (button) { button.disabled = true; if (button.tagName === "INPUT") button.value = "Sending…"; else button.textContent = "Sending…"; }
    show(form, "Sending…", true);
    fetch(ENDPOINT, { method: "POST", body: fd, mode: "cors" })
      .then(function (res) {
        return res.text().then(function (body) {
          var data = null;
          try { data = JSON.parse(body); } catch (e) { data = null; }
          if (!res.ok || (data && data.ok === false)) throw new Error((data && (data.error || data.message)) || ERROR_TEXT);
        });
      })
      .then(function () {
        if (THANK_YOU_URL) { window.location.href = THANK_YOU_URL; return; }
        form.reset();
        fillHidden(form);
        show(form, SUCCESS_TEXT, true);
      })
      .catch(function (err) {
        show(form, (err && err.message && err.message !== "Failed to fetch") ? err.message : ERROR_TEXT, false);
      })
      .then(function () {
        if (button) { button.disabled = false; if (button.tagName === "INPUT") button.value = label; else button.textContent = label; }
      });
  }

  function init() {
    var form = document.getElementById(FORM_ID);
    if (form) { ensureHoneypot(form); fillHidden(form); }
  }
  // Capture phase on the document: runs before other handlers and works for forms added later.
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || form.id !== FORM_ID) return;
    ensureHoneypot(form);
    if (!KEEP_SITE_HANDLER) { e.preventDefault(); e.stopImmediatePropagation(); }
    send(form);
  }, true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
</script>`;
}

// ---------------------------------------------------------------------------
// Full embed form
// ---------------------------------------------------------------------------

interface FieldDef { name: string; label: string; type: 'text' | 'email' | 'tel' | 'textarea' | 'file'; auto?: string; half?: boolean; placeholder?: string }

const FORM_FIELDS: FieldDef[] = [
  { name: 'first_name', label: 'First name', type: 'text', auto: 'given-name', half: true },
  { name: 'last_name', label: 'Last name', type: 'text', auto: 'family-name', half: true },
  { name: 'email', label: 'Email', type: 'email', auto: 'email', half: true },
  { name: 'phone1', label: 'Phone', type: 'tel', auto: 'tel', half: true },
  { name: 'zip_code', label: 'ZIP code', type: 'text', auto: 'postal-code', half: true },
  { name: 'model', label: 'Model you are interested in', type: 'text', half: true },
  { name: 'comments', label: 'Comments', type: 'textarea', placeholder: 'How can we help?' },
  { name: 'image_1', label: 'Photo 1 (optional)', type: 'file' },
  { name: 'image_2', label: 'Photo 2 (optional)', type: 'file' },
  { name: 'image_3', label: 'Photo 3 (optional)', type: 'file' },
];

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/heic,.heic';

/** Complete copy-paste HTML form + script for a website. */
export function embedSnippet(o: SnippetOptions): string {
  const id = formIdOf(o);
  const required = new Set(o.required || []);
  const hp = honeypotOf(o);
  const fields = FORM_FIELDS.map((f) => {
    const req = required.has(f.name) && f.type !== 'file';
    const label = `${f.label}${req ? ' *' : ''}`;
    const common = `name="${f.name}" id="${id}-${f.name}"${req ? ' required' : ''}`;
    let input: string;
    if (f.type === 'textarea') input = `<textarea ${common} rows="4"${f.placeholder ? ` placeholder="${attr(f.placeholder)}"` : ''}></textarea>`;
    else if (f.type === 'file') input = `<input type="file" ${common} accept="${IMAGE_ACCEPT}">`;
    else input = `<input type="${f.type}" ${common}${f.auto ? ` autocomplete="${f.auto}"` : ''}>`;
    return `    <div class="tgn-field${f.half ? ' tgn-half' : ''}">
      <label for="${id}-${f.name}">${attr(label)}</label>
      ${input}
    </div>`;
  }).join('\n');
  const hidden = HIDDEN_TRACKING_FIELDS.map((f) => `    <input type="hidden" name="${f}" value="">`).join('\n');
  return `<!-- TIGON lead form: ${attr(o.formName || 'Contact form')}${o.siteName ? ` (${attr(o.siteName)})` : ''} -->
<style>
  #${id} { max-width: 640px; font: inherit; }
  #${id} .tgn-grid { display: flex; flex-wrap: wrap; gap: 12px; }
  #${id} .tgn-field { flex: 1 1 100%; display: flex; flex-direction: column; gap: 4px; }
  #${id} .tgn-half { flex: 1 1 240px; }
  #${id} label { font-weight: 600; font-size: 14px; }
  #${id} input[type=text], #${id} input[type=email], #${id} input[type=tel], #${id} textarea {
    padding: 10px 12px; border: 1px solid #bbb; border-radius: 6px; font: inherit; width: 100%; box-sizing: border-box; }
  #${id} button { margin-top: 14px; padding: 12px 24px; border: 0; border-radius: 6px; background: #1b5e20; color: #fff;
    font-weight: 700; font-size: 16px; cursor: pointer; }
  #${id} button[disabled] { opacity: .6; cursor: wait; }
  #${id} .tgn-hp { position: absolute !important; left: -10000px !important; width: 1px; height: 1px; overflow: hidden; }
</style>
<form id="${id}" method="post" action="${attr(endpointOf(o))}" enctype="multipart/form-data">
  <div class="tgn-grid">
${fields}
  </div>
  <!-- Spam trap: leave this hidden field empty. Do not remove. -->
  <div class="tgn-hp" aria-hidden="true">
    <label for="${id}-hp">Leave this field empty</label>
    <input type="text" name="${attr(hp)}" id="${id}-hp" tabindex="-1" autocomplete="off" value="">
  </div>
  <!-- Filled in automatically by the script below -->
  <input type="hidden" name="form_name" value="${attr(o.formName || 'Contact form')}">
${hidden}
  <button type="submit">Send</button>
  <p class="tigon-msg" role="status" aria-live="polite"></p>
</form>
${browserScript(o, id, false)}
`;
}

/** Script-only variant that posts an existing form (by its id attribute). */
export function existingFormSnippet(o: SnippetOptions, existingFormId = 'my-contact-form'): string {
  const id = existingFormId.trim() || 'my-contact-form';
  return `<!-- TIGON lead capture for an existing form.
     1) Give your form the id "${attr(id)}"  (e.g. <form id="${attr(id)}" …>).
     2) Paste this script once on the same page (after the form, or in the footer).
     Field names: use the standard names (first_name, last_name, email, phone1, zip_code, model, comments…)
     or ask your admin to map your form's names in the webhook's "Field names" section. -->
${browserScript(o, id, true)}
`;
}

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

export const PLATFORM_TIPS: Record<string, string[]> = {
  wordpress: [
    'Block editor: add a "Custom HTML" block where the form should appear and paste the full form code.',
    'Elementor: drag an "HTML" widget onto the page and paste the full form code.',
    'Contact Form 7 / WPForms / Gravity Forms: keep your form and use the "Use my existing form" script instead. Give the form an HTML id (CF7: [contact-form-7 id="…" html_id="my-contact-form"]) and paste the script in a Custom HTML block below it, or in a footer-scripts plugin (e.g. WPCode).',
    'Caching/optimization plugins that "delay JavaScript" can stop the script — exclude it if the form does nothing.',
  ],
  webflow: [
    'Add an "Embed" element (Add panel → Components → Code Embed) and paste the full form code. It works on the published site, not in the Designer preview.',
    'To keep a native Webflow form: set the form block ID in Element settings, and paste the "existing form" script in Page settings → Before </body> tag. Webflow fields must use the standard names (or map them in "Field names").',
    'Custom code needs a paid Site plan.',
  ],
  wix: [
    'Add → Embed Code → "Embed HTML" and paste the full form code. Wix shows it inside an iframe, so resize the box so the whole form fits.',
    'Because it is an iframe, the page URL and UTM tags are those of the iframe, not the parent page. For full tracking use Settings → Custom Code (paid plan) with the existing-form script, or a Velo form.',
    'Wix Forms (native) cannot be attached by script — use the embed form instead.',
  ],
  squarespace: [
    'Edit the page → add a "Code" block → paste the full form code and turn off "Display source".',
    'Code blocks need a Core/Business plan or higher. Scripts only run on the live site, not in the editor.',
    'Native Squarespace forms cannot be attached by script — use the embed form instead.',
  ],
  shopify: [
    'Online Store → Themes → Customize → add a "Custom Liquid" section (or block) on the page and paste the full form code.',
    'Or edit a page, click "Show HTML" (<>) and paste it there (the script tag is kept by most themes).',
    'Shopify\'s built-in contact form keeps working — this form sends to TIGON instead.',
  ],
  custom: [
    'Paste the full form code where the form should appear in your HTML. Nothing else is needed.',
    'Already have a form? Give it an id and paste the "existing form" script once on the page.',
  ],
};

export const platformTips = (p?: string) => PLATFORM_TIPS[p || 'custom'] || PLATFORM_TIPS.custom;

export interface FieldRef { field: string; label: string; example: string; required: boolean; notes: string; group: 'Lead' | 'Tracking' }

const FIELD_NOTES: Record<string, string> = {
  form_name: 'Which form on the site sent the lead. The script fills it in.',
  phone1: 'Main phone number. Any format.',
  user_ip: 'Captured automatically by the server — do not send.',
  url: 'Page the form was on. The script fills it in.',
  image_1: 'Photo upload (optional). Up to 10 MB: jpg, png, gif, webp or heic.',
  image_2: 'Photo upload (optional). Up to 10 MB: jpg, png, gif, webp or heic.',
  image_3: 'Photo upload (optional). Up to 10 MB: jpg, png, gif, webp or heic.',
  utm_source: 'From the page link (?utm_source=…). First visit is remembered for 30 days.',
  utm_medium: 'From the page link. Remembered for 30 days.',
  utm_campaign: 'From the page link. Remembered for 30 days.',
  utm_term: 'From the page link. Remembered for 30 days.',
  utm_content: 'From the page link. Remembered for 30 days.',
  gclid: 'Google Ads click id, from the page link.',
  fbclid: 'Facebook click id, from the page link.',
  ga_client_id: 'From the Google Analytics _ga cookie — links the lead to the GA4 visitor.',
  referrer: 'Site the visitor came from. The script fills it in.',
  user_agent: 'Browser — captured automatically by the server.',
};

const EXAMPLES: Record<string, string> = {
  phone2: '(555) 010-3000', address: '12 Main St, Philadelphia, PA', vin_number: '1TGN0000000000001', sku_number: 'BLZ4-RED',
  image_1: '(file)', image_2: '(file)', image_3: '(file)', utm_term: 'golf carts', utm_content: 'ad-1', gclid: 'Cj0KCQjw…',
  fbclid: 'IwAR2…', ga_client_id: '1234567890.1712345678', referrer: 'https://www.google.com/', user_agent: 'Mozilla/5.0 …',
};

export function fieldReference(required: string[] = []): FieldRef[] {
  const req = new Set(required);
  return [
    ...LEAD_FIELDS.map((f) => ({ field: f, label: fieldLabel(f), example: SAMPLE_LEAD[f] || EXAMPLES[f] || '', required: req.has(f), notes: FIELD_NOTES[f] || '', group: 'Lead' as const })),
    ...TRACKING_FIELDS.map((f) => ({ field: f, label: fieldLabel(f), example: SAMPLE_LEAD[f] || EXAMPLES[f] || '', required: false, notes: FIELD_NOTES[f] || '', group: 'Tracking' as const })),
  ];
}

export function curlExamples(o: SnippetOptions): { form: string; json: string; hmac: string } {
  const url = endpointOf(o);
  const sample = {
    form_name: o.formName || 'Contact form', first_name: 'Jane', last_name: 'Sample', email: 'jane.sample@example.com',
    phone1: '5550102000', zip_code: '19104', model: 'Tigon Blaze 4', comments: 'Test lead — please ignore',
  };
  const form = `curl -X POST "${url}" \\\n${Object.entries(sample).map(([k, v]) => `  -F "${k}=${v}"`).join(' \\\n')} \\\n  -F "image_1=@/path/to/photo.jpg"`;
  const body = JSON.stringify(sample);
  const json = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
  const hmac = `# Signed request (required when "Require signature" is on).
# Signature = HMAC-SHA256 of the exact raw request body, hex encoded, using the webhook secret.
SECRET="paste-the-secret-here"
BODY='${body}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')
curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -H "X-Tigon-Signature: sha256=$SIG" \\
  -d "$BODY"

// Node.js
const crypto = require('crypto');
const body = JSON.stringify(lead);
const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
await fetch('${url}', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Tigon-Signature': 'sha256=' + sig}, body});`;
  return { form, json, hmac };
}

export const GA4_CHECKLIST: Array<{ id: string; label: string; help: string }> = [
  { id: 'mid', label: 'Measurement ID added', help: 'GA4 → Admin → Data streams → your web stream → "Measurement ID" (starts with G-). Paste it in this website\'s settings.' },
  { id: 'secret', label: 'API secret created', help: 'Same web stream → "Measurement Protocol API secrets" → Create. Paste the secret value in this website\'s settings.' },
  { id: 'key', label: '"generate_lead" marked as a key event', help: 'GA4 → Admin → Events (or Key events) → mark generate_lead as a key event after the first lead arrives, or create it as a new key event now.' },
  { id: 'verify', label: 'Verified in Realtime / DebugView', help: 'Send a test lead, then open GA4 → Reports → Realtime (or Admin → DebugView) and look for generate_lead.' },
  { id: 'cid', label: 'ga_client_id is being captured', help: 'Open a test submission here and check that "GA client id" has a value. It needs the GA4 tag (gtag.js / Tag Manager) on the website.' },
];

/** How each lead field should appear on the website form. */
const FORM_SPEC: Record<string, { input: string; visible: boolean }> = {
  form_name: { input: 'input (fixed value, see below)', visible: false },
  first_name: { input: 'text, autocomplete="given-name"', visible: true },
  last_name: { input: 'text, autocomplete="family-name"', visible: true },
  phone1: { input: 'tel, autocomplete="tel"', visible: true },
  phone2: { input: 'tel (label "Alternate phone")', visible: true },
  address: { input: 'text, autocomplete="street-address"', visible: true },
  email: { input: 'email, autocomplete="email"', visible: true },
  zip_code: { input: 'text, inputmode="numeric", autocomplete="postal-code"', visible: true },
  model: { input: 'text or select (cart model the customer is interested in)', visible: true },
  brand: { input: 'text or select (cart brand)', visible: true },
  vin_number: { input: 'text (label "VIN", optional)', visible: true },
  sku_number: { input: 'text (label "Stock # / SKU", optional; may be hidden and pre-filled on inventory pages)', visible: true },
  url: { input: 'input', visible: false },
  comments: { input: 'textarea (label "Message")', visible: true },
  image_1: { input: 'file, accept="image/*"', visible: true },
  image_2: { input: 'file, accept="image/*"', visible: true },
  image_3: { input: 'file, accept="image/*"', visible: true },
};

export function aiPrompt(o: SnippetOptions): string {
  const endpoint = endpointOf(o);
  const site = o.siteName || '(this website)';
  const siteUrl = o.siteUrl || '';
  const form = o.formName || 'Contact form';
  const refs = fieldReference(o.required);
  const lead = refs.filter((r) => r.group === 'Lead' && r.field !== 'user_ip');
  const required = lead.filter((r) => r.required).map((r) => r.field);
  const mapped = Object.entries(o.fieldMap || {}).filter(([k, v]) => k && v);
  const example: Record<string, string> = {};
  for (const r of lead) if (!r.field.startsWith('image_')) example[r.field] = r.field === 'form_name' ? form : (r.example || '');
  example.url = siteUrl ? `${siteUrl}/contact` : 'https://example.com/contact';
  Object.assign(example, {
    referrer: 'https://www.google.com/', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'spring-sale', utm_term: '', utm_content: '',
    gclid: '', fbclid: '', ga_client_id: '1234567890.1712345678', [honeypotOf(o)]: '',
  });

  return `You are helping me connect the lead form(s) on my website to the TIGON IOT lead system ("Webhook Flows"). Read everything below, then do the tasks at the end. Every detail here is specific to THIS website.

=== THIS WEBSITE ===
Website name: ${site}
Website address: ${siteUrl || '(not set)'}
Website builder / platform: ${platformLabel(o.platform)}
Form: ${form}

=== THIS WEBSITE'S UNIQUE WEBHOOK ===
Endpoint (POST): ${endpoint}
Webhook key: ${o.key}

- This webhook belongs to ${site}${siteUrl ? ` (${siteUrl})` : ''} ONLY. It is unique to this website and this form. Never reuse it on another website, and never use another website's webhook here — every website (and every separate form) gets its own webhook, created in TIGON IOT → Webhook Flows → Add website.
- The key in the address works like a password: only put it in this website's form code or server settings. Do not publish it in documentation, public repositories or other sites.
- Leads are only accepted from this website's own address${siteUrl ? ` (${siteUrl})` : ''} when sent from a browser (other origins are rejected).

=== THIS WEBSITE'S OWN SECRET (signature) ===
- This webhook has its OWN signing secret. It is created for this webhook only (TIGON IOT → Webhook Flows → Webhooks → this webhook → Setup packet → Developers → "Create secret"), shown once, and must never be shared with or copied to any other website.
- Signing: header X-Tigon-Signature: sha256=<hex HMAC-SHA256 of the exact raw request body, using this webhook's secret>.
- The secret must ONLY live on the server side (e.g. wp-config.php / an environment variable / the hosting's secret settings). NEVER put it in browser JavaScript, HTML, or anything a visitor can download.
${o.hmacRequired
    ? `- STATUS: signatures are REQUIRED for this webhook. Unsigned requests are rejected (HTTP 401). Therefore the form must NOT post directly from the browser. Build a small server-side handler on this website (for WordPress: a REST route or admin-ajax action in a small plugin / functions.php; other platforms: a serverless function) that receives the form, adds the X-Tigon-Signature header using the secret from server config, and forwards the SAME multipart or JSON body to the endpoint.`
    : `- STATUS: signatures are currently OPTIONAL for this webhook, so the form may post directly from the browser (no secret in the browser!). If this website can send leads from its server, prefer that: store this webhook's secret in server config, sign every request, and then turn on "Require signature" for this webhook in TIGON IOT so unsigned requests are rejected.`}

=== HOW TO SEND ===
- Method: POST to ${endpoint}
- Body: multipart/form-data (a FormData object) so photos upload. application/json or application/x-www-form-urlencoded also work when there are no files.
- Success: HTTP 200 with JSON {"ok": true, "id": "..."}. Show a thank-you message${o.thankYouUrl ? ` and redirect to ${o.thankYouUrl}` : ''}. Otherwise show the "error" text from the JSON. HTTP 429 = too many tries, ask the visitor to wait a minute.
- Disable the submit button while sending; re-enable it afterwards.

=== REQUIRED FORM FIELDS (rebuild the form with ALL of these) ===
Use these EXACT name attributes. Visible fields should have clear labels.${required.length ? ` Mark as required (HTML required + JS check): ${required.join(', ')}.` : ' No field is strictly required by the system, but ask for at least first_name, last_name, email and phone1 (make those required on the form).'}
${lead.map((r) => {
    const spec = FORM_SPEC[r.field];
    return `- ${r.field} — ${r.label}${r.required ? ' (REQUIRED)' : ''}; ${spec ? `${spec.visible ? 'visible' : 'hidden'} ${spec.input}` : 'text'}${r.notes ? `. ${r.notes}` : ''}`;
  }).join('\n')}
- form_name must always be sent with the value: "${form}"
- Photos: image_1, image_2, image_3 are optional, max 10 MB each, jpg / png / gif / webp / heic. Leave out empty file inputs.
- Do NOT send user_ip or user_agent — the server records them.
- Any extra fields you keep are stored too, but everything important must use the names above.${mapped.length ? `
- This webhook already maps these incoming names (you may keep them): ${mapped.map(([k, v]) => `${k} → ${v}`).join(', ')}.` : ''}

=== HIDDEN TRACKING FIELDS (filled by JavaScript right before sending) ===
- url = window.location.href
- referrer = document.referrer
- utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid = from the page's query string. Save the first values seen in localStorage for 30 days and keep sending those (first-touch attribution).
- ga_client_id = from the "_ga" cookie: "GA1.1.123456.789012" → "123456.789012"${o.ga4MeasurementId ? ` (GA4 property ${o.ga4MeasurementId} is used for this website)` : ''}.

=== SPAM TRAP (required) ===
- Add a hidden text input named "${honeypotOf(o)}" that real visitors never see: move its wrapper off-screen with CSS (position:absolute; left:-9999px), tabindex="-1", autocomplete="off", aria-hidden="true" on the wrapper. It must be sent EMPTY. Don't rely on display:none alone. Make sure no real field uses this name.

=== EXAMPLE OF ONE COMPLETE SUBMISSION (JSON form of the same fields) ===
${JSON.stringify(example, null, 2)}

=== YOUR TASKS ===
1. Find every lead / contact / quote / inventory-inquiry form on ${site}. Rebuild or edit each one so it contains ALL the fields listed above with the EXACT names (rename existing inputs; add the missing ones; keep the site's look and style).
2. Add the hidden form_name, tracking fields and the spam trap exactly as described.
3. Send submissions to THIS website's endpoint above — ${o.hmacRequired ? 'through a server-side handler that signs each request with this webhook\'s own secret' : 'directly from the browser, or (preferred when possible) through a server-side handler that signs each request with this webhook\'s own secret'}.
4. Keep client-side validation (required fields, email format, phone at least 10 digits, photos ≤ 10 MB) and show friendly error messages.
5. If a page lists a specific cart, pre-fill brand, model, vin_number and sku_number from that cart (hidden or read-only) so the lead shows which cart was asked about.
6. Explain exactly where each piece goes on ${platformLabel(o.platform)}${o.platform && o.platform !== 'custom' ? ' (which page, block, widget, plugin file or setting)' : ''}, and where the secret is stored on the server.
7. Explain how to test: submit once with my own details, confirm the thank-you message, and confirm the lead appears in TIGON IOT → Webhook Flows → Submissions with every field filled in.`;
}

/** Everything in one downloadable text file (Markdown). */
export function setupPacketText(o: SnippetOptions, existingFormId = 'my-contact-form'): string {
  const refs = fieldReference(o.required);
  const curl = curlExamples(o);
  const fence = '```';
  return `# Website lead form setup — ${o.siteName || o.formName}

Generated by TIGON IOT Webhook Flows on ${new Date().toLocaleString()}.

- Website: ${o.siteName || ''} ${o.siteUrl || ''}
- Platform: ${platformLabel(o.platform)}
- Form: ${o.formName}
- Endpoint URL: ${endpointOf(o)}

Keep this address private — anyone who has it can send leads.

## 1. Paste the form on your website (${platformLabel(o.platform)})

${platformTips(o.platform).map((t) => `- ${t}`).join('\n')}

${fence}html
${embedSnippet(o)}
${fence}

## 2. Or: use your existing form

${fence}html
${existingFormSnippet(o, existingFormId)}
${fence}

## 3. Field reference

| Field | Label | Example | Required | Notes |
|---|---|---|---|---|
${refs.map((r) => `| ${r.field} | ${r.label} | ${r.example.replace(/\|/g, '/')} | ${r.required ? 'yes' : ''} | ${r.notes} |`).join('\n')}

Spam trap: a hidden input named "${honeypotOf(o)}" must be sent empty.

## 4. Developers: cURL / JSON

${fence}bash
${curl.form}
${fence}

${fence}bash
${curl.json}
${fence}
${o.hmacRequired ? `
This webhook requires a signature:

${fence}bash
${curl.hmac}
${fence}
` : ''}
## 5. Google Analytics 4 checklist

${GA4_CHECKLIST.map((c) => `- [ ] ${c.label} — ${c.help}`).join('\n')}

## 6. Prompt for an AI assistant

${fence}text
${aiPrompt(o)}
${fence}
`;
}
