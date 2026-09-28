/** Webhook Flows — default email templates created by "Set up Webhook Flows" (bootstrap.ts). */

/** Fixed document ids used by the defaults (idempotent setup). */
export const DEFAULT_IDS = {
  masterFlow: 'master',
  standardFlow: 'standard',
  newLeadTemplate: 'tpl_new_lead',
  autoReplyTemplate: 'tpl_auto_reply',
} as const;

export const NEW_LEAD_SUBJECT = 'New lead from {{domain_name}}: {{first_name}} {{last_name}}';

export const NEW_LEAD_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;padding:24px 0">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">
      <tr><td style="background:#1b5e20;padding:20px 24px;color:#ffffff">
        <div style="font-size:13px;opacity:.85;text-transform:uppercase;letter-spacing:1px">New website lead</div>
        <div style="font-size:22px;font-weight:bold;margin-top:4px">{{domain_name}}</div>
      </td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 8px;font-size:20px">{{first_name}} {{last_name}}</h1>
        <p style="margin:0 0 16px;color:#52606d;font-size:14px">
          {{#if phone1}}Phone: <a href="tel:{{phone1}}" style="color:#1b5e20">{{phone1}}</a><br>{{/if}}
          {{#if email}}Email: <a href="mailto:{{email}}" style="color:#1b5e20">{{email}}</a><br>{{/if}}
          {{#if form_name}}Form: {{form_name}}{{/if}}
        </p>
        {{#if comments}}
        <div style="background:#f1f8e9;border-left:4px solid #1b5e20;padding:12px 16px;margin:0 0 16px;font-size:15px;line-height:1.5">
          <div style="font-size:12px;color:#52606d;text-transform:uppercase;margin-bottom:4px">Message</div>
          {{comments}}
        </div>
        {{/if}}
        <h2 style="font-size:15px;margin:20px 0 8px">All details</h2>
        {{all_fields_table}}
        {{#if image_1}}
        <h2 style="font-size:15px;margin:20px 0 8px">Photos</h2>
        <p style="margin:0">
          <a href="{{image_1}}"><img src="{{image_1}}" alt="Photo 1" style="max-width:100%;border-radius:6px;margin-bottom:8px"></a>
          {{#if image_2}}<br><a href="{{image_2}}"><img src="{{image_2}}" alt="Photo 2" style="max-width:100%;border-radius:6px;margin-bottom:8px"></a>{{/if}}
          {{#if image_3}}<br><a href="{{image_3}}"><img src="{{image_3}}" alt="Photo 3" style="max-width:100%;border-radius:6px"></a>{{/if}}
        </p>
        {{/if}}
        {{#if lead_url}}
        <p style="margin:24px 0 0;text-align:center">
          <a href="{{lead_url}}" style="display:inline-block;background:#1b5e20;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold">Open this lead in TIGON IOT</a>
        </p>
        {{/if}}
      </td></tr>
      <tr><td style="padding:16px 24px;background:#f8f9fa;color:#7b8794;font-size:12px">
        Received {{submitted_at}}{{#if webhook_name}} via {{webhook_name}}{{/if}}{{#if url}} from <a href="{{url}}" style="color:#7b8794">{{url}}</a>{{/if}}.
        Sent by TIGON IOT Webhook Flows.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

export const NEW_LEAD_TEXT = `New lead from {{domain_name}}

{{first_name}} {{last_name}}
{{#if phone1}}Phone: {{phone1}}
{{/if}}{{#if email}}Email: {{email}}
{{/if}}{{#if comments}}
Message:
{{comments}}
{{/if}}
All details:
{{all_fields_table}}
{{#if lead_url}}
Open the lead: {{lead_url}}
{{/if}}
Received {{submitted_at}}{{#if webhook_name}} via {{webhook_name}}{{/if}}.`;

export const AUTO_REPLY_SUBJECT = 'Thanks for contacting {{domain_name}}';

export const AUTO_REPLY_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;padding:24px 0">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">
      <tr><td style="background:#1b5e20;padding:20px 24px;color:#ffffff;font-size:20px;font-weight:bold">{{domain_name}}</td></tr>
      <tr><td style="padding:24px;font-size:15px;line-height:1.6">
        <p style="margin:0 0 12px">Hi {{#if first_name}}{{first_name}}{{else}}there{{/if}},</p>
        <p style="margin:0 0 12px">Thanks for reaching out! We received your message and a member of our team will get back to you shortly{{#if model}} about the {{model}}{{/if}}.</p>
        {{#if comments}}<p style="margin:0 0 12px;color:#52606d">Your message: <em>{{comments}}</em></p>{{/if}}
        <p style="margin:0">Talk soon,<br>The {{domain_name}} team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

export const AUTO_REPLY_TEXT = `Hi {{#if first_name}}{{first_name}}{{else}}there{{/if}},

Thanks for reaching out! We received your message and a member of our team will get back to you shortly{{#if model}} about the {{model}}{{/if}}.
{{#if comments}}
Your message: {{comments}}
{{/if}}
Talk soon,
The {{domain_name}} team`;
