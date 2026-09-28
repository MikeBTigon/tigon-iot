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

export function aiPrompt(o: SnippetOptions): string {
  const refs = fieldReference(o.required);
  const lead = refs.filter((r) => r.group === 'Lead' && r.field !== 'user_ip');
  return `I need help connecting the lead form on my website to a lead system. Please give me exact, copy-paste code and step-by-step instructions for my platform.

Website: ${o.siteName || '(my website)'}${o.siteUrl ? ` — ${o.siteUrl}` : ''}
Platform: ${platformLabel(o.platform)}
Form: ${o.formName || 'Contact form'}

WHERE TO SEND
- Every submission must be sent with an HTTP POST to: ${endpointOf(o)}
- Send it as multipart/form-data (a FormData object) so photo uploads work. application/json and application/x-www-form-urlencoded are also accepted when there are no files.
- No API key or login is needed; the address itself is the key, so don't publish it anywhere except the form code.
- A successful post returns HTTP 200 with JSON like {"ok": true}. Show a thank-you message${o.thankYouUrl ? ` or redirect to ${o.thankYouUrl}` : ''} on success, and an error message otherwise. Disable the submit button while sending.

FIELD NAMES (use these exact names; any other fields are kept too)
${lead.map((r) => `- ${r.field}: ${r.label}${r.required ? ' (REQUIRED)' : ''}${r.notes ? ` — ${r.notes}` : ''}`).join('\n')}
- Photos (image_1, image_2, image_3) are optional file inputs, max 10 MB each, jpg/png/gif/webp/heic.
- The visitor's IP address and browser are captured by the server; don't send them.

SPAM TRAP (important)
- Add a hidden text input named "${honeypotOf(o)}" that real visitors never see (move it off-screen with CSS, tabindex="-1", autocomplete="off", aria-hidden on its wrapper). It must be sent EMPTY. Bots fill it in and those posts are dropped. Don't use display:none only.

TRACKING (hidden fields filled by JavaScript before sending)
- url = window.location.href
- referrer = document.referrer
- utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid = from the page's query string. Save the first values you see in localStorage for 30 days and keep sending those (first-touch attribution).
- ga_client_id = from the "_ga" cookie: "GA1.1.123456.789012" → "123456.789012".
- form_name = "${o.formName || 'Contact form'}"

WHAT I NEED FROM YOU
1. Look at my existing form (I will paste its HTML or describe it) and wire it to send to the address above with the field names above. If my form's field names are different, rename them or map them in the code.
2. Keep my form's look. Don't remove required-field checks.
3. Tell me exactly where to paste the code on ${platformLabel(o.platform)}${o.platform && o.platform !== 'custom' ? ' (which block/widget/setting)' : ''}.
4. Tell me how to test it (submit once with my own details and confirm the thank-you message).${o.hmacRequired ? `

NOTE: this endpoint requires an HMAC signature header (X-Tigon-Signature: sha256=<hex HMAC-SHA256 of the raw body>) which must be computed on a server, never in browser code. Only do this from server-side code.` : ''}`;
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
