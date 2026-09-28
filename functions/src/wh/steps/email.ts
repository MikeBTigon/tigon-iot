// Webhook Flows — email step (staff notification + optional customer auto-reply), sendMail, whTestEmail.
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import type {Transporter} from 'nodemailer';
import {createHash, randomBytes} from 'crypto';
import {WH} from '../types';
import type {WhDomain, WhEmailTemplate, WhFlow, WhIntegration, WhSettings, WhSubmission, WhWebhook} from '../types';
import {renderTemplate, resolveSettings, SAMPLE_LEAD} from '../shared';
import type {MergeData} from '../shared';
import type {StepContext, StepResult} from '../engineTypes';
import {getIntegrationSecrets, getTemplate, pickIntegration} from './cache';
import {ctxMergeData, errMsg, fail, formatNy, isReservedEmail, isTestSubmission, isValidEmail, mergeDataFor, toList} from './util';

export interface MailMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** Mail failure with a plain-English message and whether a retry could help. */
export class WhMailError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

export const NO_SMTP_MESSAGE = 'No email server set up yet — add one in Webhook Flows → Settings → Integrations.';

// ---------------------------------------------------------------------------
// Built-in template
// ---------------------------------------------------------------------------

export const DEFAULT_TEMPLATE: Pick<WhEmailTemplate, 'subject' | 'htmlBody' | 'textBody'> = {
  subject: 'New lead from {{domain_name}}{{#if form_name}} ({{form_name}}){{/if}}: {{first_name}} {{last_name}}',
  htmlBody: `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:640px;margin:0 auto">
<div style="background:#1b5e20;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0">
<div style="font-size:12px;opacity:.85">{{domain_name}}{{#if form_name}} · {{form_name}}{{/if}}</div>
<div style="font-size:20px;font-weight:bold;margin-top:4px">New lead: {{first_name}} {{last_name}}</div>
</div>
<div style="border:1px solid #ddd;border-top:0;padding:16px 18px;border-radius:0 0 8px 8px">
<p style="margin:0 0 12px">
{{#if phone1}}<a href="tel:{{phone1}}" style="display:inline-block;background:#2e7d32;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;margin:0 6px 6px 0">Call {{phone1}}</a>{{/if}}
{{#if email}}<a href="mailto:{{email}}" style="display:inline-block;background:#1565c0;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;margin:0 6px 6px 0">Email {{email}}</a>{{/if}}
</p>
{{#if comments}}<p style="background:#fff8e1;border-left:4px solid #f9a825;padding:10px 12px;margin:0 0 14px;white-space:pre-wrap">{{comments}}</p>{{/if}}
{{all_fields_table}}
<p style="font-size:12px;color:#777;margin:16px 0 0">Received {{submitted_at}} · <a href="{{lead_url}}">Open in TIGON IOT</a> · Reply to this email to answer the customer.</p>
</div>
</div>`,
  textBody: `New lead from {{domain_name}}{{#if form_name}} ({{form_name}}){{/if}}

{{all_fields_table}}

Received {{submitted_at}}
Open in TIGON IOT: {{lead_url}}`,
};

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

interface SmtpSetup {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromEmail: string;
  fromName: string;
}

/** SMTP connection details for an integration, applying provider presets. */
export function smtpSetup(integration: WhIntegration, secrets: Record<string, string>): SmtpSetup {
  const c = (integration.config || {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v));
  const provider = str(c.provider).toLowerCase() || 'custom';
  let host = str(c.host);
  let port = Number(c.port) || 0;
  let user = str(secrets.user);
  let pass = str(secrets.pass);
  if (provider === 'postmark') {
    host = 'smtp.postmarkapp.com';
    port = port || 587;
    const token = str(secrets.token) || pass || user;
    user = token;
    pass = token;
  } else if (provider === 'sendgrid') {
    host = 'smtp.sendgrid.net';
    port = port || 587;
    user = 'apikey';
    pass = str(secrets.apiKey) || pass;
  } else if (provider === 'ses') {
    host = `email-smtp.${str(c.region) || 'us-east-1'}.amazonaws.com`;
    port = port || 587;
  } else if (provider === 'gmail') {
    host = 'smtp.gmail.com';
    port = port || 465;
  }
  port = port || 587;
  const secure = typeof c.secure === 'boolean' ? c.secure : port === 465;
  const fromEmail = str(c.fromEmail) || (isValidEmail(user) ? user : '');
  return {host, port, secure, user: user || undefined, pass: pass || undefined, fromEmail, fromName: str(c.fromName)};
}

const TRANSPORT_TTL_MS = 5 * 60 * 1000;
const transports = new Map<string, {at: number; t: Transporter}>();

function transportFor(integration: WhIntegration, setup: SmtpSetup): Transporter {
  const key = `${integration.id}:${integration.updatedAt || 0}:${integration.credentialsSetAt || 0}:${setup.host}:${setup.port}`;
  const hit = transports.get(key);
  if (hit && Date.now() - hit.at < TRANSPORT_TTL_MS) return hit.t;
  for (const [k, v] of transports) {
    if (k.startsWith(integration.id + ':')) {
      v.t.close();
      transports.delete(k);
    }
  }
  const t = nodemailer.createTransport({
    host: setup.host,
    port: setup.port,
    secure: setup.secure,
    auth: setup.user ? {user: setup.user, pass: setup.pass || ''} : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  transports.set(key, {at: Date.now(), t});
  return t;
}

/** nodemailer/SMTP error → WhMailError with a clear message. */
function classify(e: unknown): WhMailError {
  const err = e as {code?: string; responseCode?: number; message?: string};
  const code = err.code || '';
  const rc = Number(err.responseCode || 0);
  const detail = errMsg(e);
  if (code === 'EAUTH' || rc === 535 || rc === 534) {
    return new WhMailError(`The email server rejected the username/password (${detail}). Check the credentials in Webhook Flows → Settings → Integrations.`, false);
  }
  if (code === 'EENVELOPE' || (rc >= 550 && rc <= 553)) {
    return new WhMailError(`The email server refused the message or a recipient: ${detail}`, false);
  }
  if (rc >= 500 && rc < 600) return new WhMailError(`The email server refused the message: ${detail}`, false);
  if (code === 'EDNS' || code === 'ENOTFOUND') {
    return new WhMailError(`Email server host not found (${detail}). Check the host in Settings → Integrations.`, true);
  }
  return new WhMailError(`Could not send the email: ${detail}`, true);
}

/** Send through an SMTP integration: first matching id, else settings.smtpIntegrationId, else the first SMTP integration. */
export async function sendMailVia(
  integrationIds: unknown[], settings: WhSettings, msg: MailMessage, opts: {messageId?: string} = {},
): Promise<{messageId: string; accepted: number}> {
  const integration = await pickIntegration('smtp', ...integrationIds, settings.smtpIntegrationId);
  if (!integration) throw new WhMailError(NO_SMTP_MESSAGE, false);
  const setup = smtpSetup(integration, await getIntegrationSecrets(integration.id));
  if (!setup.host) throw new WhMailError(`The email server "${integration.name || integration.id}" has no host set. Fix it in Settings → Integrations.`, false);
  if (!setup.fromEmail) throw new WhMailError(`The email server "${integration.name || integration.id}" has no "From" email address. Fix it in Settings → Integrations.`, false);
  const to = msg.to.filter(isValidEmail);
  if (!to.length) throw new WhMailError('No valid email recipients.', false);
  const fromName = (settings.emailFromName || setup.fromName || 'TIGON IOT').replace(/["\r\n]/g, '');
  try {
    const info = await transportFor(integration, setup).sendMail({
      from: {name: fromName, address: setup.fromEmail},
      to,
      cc: (msg.cc || []).filter(isValidEmail),
      bcc: (msg.bcc || []).filter(isValidEmail),
      subject: msg.subject.replace(/[\r\n]+/g, ' ').slice(0, 250),
      html: msg.html,
      text: msg.text,
      replyTo: msg.replyTo && isValidEmail(msg.replyTo) ? msg.replyTo : undefined,
      ...(opts.messageId ? {messageId: opts.messageId} : {}),
    });
    return {messageId: String(info.messageId || opts.messageId || ''), accepted: Array.isArray(info.accepted) ? info.accepted.length : to.length};
  } catch (e) {
    throw classify(e);
  }
}

/** Public helper for other modules (alerts, digests, ADF-by-email). */
export async function sendMail(settings: WhSettings, msg: MailMessage): Promise<{messageId: string}> {
  const r = await sendMailVia([], settings, msg);
  return {messageId: r.messageId};
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

async function loadTemplate(id: unknown): Promise<Pick<WhEmailTemplate, 'subject' | 'htmlBody' | 'textBody'> | null> {
  if (typeof id !== 'string' || !id || id === 'inherit' || id === 'default') return DEFAULT_TEMPLATE;
  return getTemplate(id);
}

export function renderEmail(tpl: Pick<WhEmailTemplate, 'subject' | 'htmlBody' | 'textBody'>, data: MergeData, subjectOverride?: string) {
  const subject = renderTemplate(subjectOverride || tpl.subject || DEFAULT_TEMPLATE.subject, data, false).replace(/\s+/g, ' ').trim();
  const html = renderTemplate(tpl.htmlBody || DEFAULT_TEMPLATE.htmlBody, data, true);
  const text = tpl.textBody ? renderTemplate(tpl.textBody, data, false) :
    renderTemplate(DEFAULT_TEMPLATE.textBody, data, false);
  return {subject, html, text};
}

/** Deterministic Message-ID per step run: a re-send after a crash carries the same id (many inboxes collapse it). */
const stableMessageId = (runId: string, suffix: string) =>
  `<wh.${createHash('sha256').update(runId + suffix).digest('hex').slice(0, 32)}@tigoniot.com>`;

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

export async function emailStep(ctx: StepContext): Promise<StepResult> {
  const c = ctx.step.config || {};
  const s = ctx.settings;
  const isTest = isTestSubmission(ctx.submission);
  const pick = (stepVal: unknown, inherited: unknown) => {
    const list = toList(stepVal);
    return list.length ? list : toList(inherited);
  };
  const to = pick(c.to, s.emailTo).filter(isValidEmail);
  const cc = pick(c.cc, s.emailCc).filter(isValidEmail);
  const bcc = pick(c.bcc, s.emailBcc).filter(isValidEmail);
  if (!to.length) {
    return fail('No email recipients — add "To" addresses to this step or in the website/flow settings (Email → To).', false);
  }
  const templateId = c.templateId || s.emailTemplateId;
  const tpl = await loadTemplate(templateId);
  if (!tpl) return fail(`Email template "${templateId}" was not found (it may have been deleted). Pick another template.`, false);

  const data = ctxMergeData(ctx);
  const rendered = renderEmail(tpl, data, typeof c.subject === 'string' && c.subject.trim() ? c.subject : undefined);
  const prefix = isTest ? '[TEST] ' : '';
  const leadEmail = isValidEmail(ctx.submission.email) ? String(ctx.submission.email).trim() : '';
  const replyTo = s.emailReplyTo && isValidEmail(s.emailReplyTo) ? s.emailReplyTo : leadEmail || undefined;

  let main: {messageId: string; accepted: number};
  try {
    main = await sendMailVia([c.integrationId], s, {
      to, cc, bcc, subject: prefix + rendered.subject, html: rendered.html, text: rendered.text, replyTo,
    }, {messageId: stableMessageId(ctx.runId, '')});
  } catch (e) {
    const err = e instanceof WhMailError ? e : classify(e);
    return fail(err.message, err.retryable);
  }
  const response: Record<string, unknown> = {messageId: main.messageId, to: to.length, cc: cc.length, bcc: bcc.length};

  // Customer auto-reply: a separate send; its failure never re-sends the staff email.
  if (c.autoReply !== false && s.autoReplyEnabled && s.autoReplyTemplateId) {
    if (!leadEmail) {
      response.autoReply = 'skipped: no valid customer email';
    } else if (isReservedEmail(leadEmail)) {
      response.autoReply = 'skipped: example/test address';
    } else {
      const arTpl = await getTemplate(String(s.autoReplyTemplateId));
      if (!arTpl) {
        response.autoReply = `failed: auto-reply template "${s.autoReplyTemplateId}" not found`;
      } else {
        try {
          const ar = renderEmail(arTpl, data);
          const r = await sendMailVia([c.integrationId], s, {
            to: [leadEmail], subject: prefix + ar.subject, html: ar.html, text: ar.text,
            replyTo: s.emailReplyTo && isValidEmail(s.emailReplyTo) ? s.emailReplyTo : undefined,
          }, {messageId: stableMessageId(ctx.runId, ':autoreply')});
          response.autoReply = 'sent';
          response.autoReplyMessageId = r.messageId;
        } catch (e) {
          response.autoReply = `failed: ${errMsg(e)}`;
          logger.warn('wh auto-reply failed', {submissionId: ctx.submission.id, error: errMsg(e)});
        }
      }
    }
  }
  return {status: 'success', response};
}

// ---------------------------------------------------------------------------
// whTestEmail (callable)
// ---------------------------------------------------------------------------

const db = () => admin.firestore();

async function docData<T>(col: string, id: unknown): Promise<T | null> {
  if (typeof id !== 'string' || !id) return null;
  const snap = await db().collection(col).doc(id).get();
  return snap.exists ? ({...(snap.data() as object), id: snap.id} as T) : null;
}

/** Same cascade as the engine: global → master flow → domain → webhook's flow → webhook. */
export async function settingsFor(domain: WhDomain | null, webhook: WhWebhook | null): Promise<WhSettings> {
  const global = (await db().collection(WH.settings).doc('global').get()).data() || {};
  const master = await docData<WhFlow>(WH.flows, global.masterFlowId);
  const flow = await docData<WhFlow>(WH.flows, webhook?.flowId);
  const {masterFlowId: _m, defaultFlowId: _d, retentionDays: _r, failureSpikePerHour: _f, ...globalSettings} = global;
  return resolveSettings(globalSettings as WhSettings, master?.settings, domain?.settings, flow?.settings, webhook?.settings);
}

export const whTestEmail = onCall({timeoutSeconds: 60, memory: '256MiB'}, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const email = String(req.auth.token.email || '');
  if (!email.toLowerCase().endsWith('@tigongolfcarts.com')) {
    throw new HttpsError('permission-denied', 'Only @tigongolfcarts.com accounts can send test emails.');
  }
  const role = (await db().collection('mp_users').doc(req.auth.uid).get()).get('role');
  if (role !== 'admin' && role !== 'manager') throw new HttpsError('permission-denied', 'Only managers and admins can send test emails.');

  const d = (req.data || {}) as Record<string, unknown>;
  const to = toList(d.to);
  if (!to.length || !to.every(isValidEmail)) throw new HttpsError('invalid-argument', 'Enter a valid email address to send the test to.');
  if (to.length > 5) throw new HttpsError('invalid-argument', 'Send the test to at most 5 addresses.');

  const submission = await docData<WhSubmission>(WH.submissions, d.submissionId);
  if (d.submissionId && !submission) throw new HttpsError('not-found', 'That submission no longer exists.');
  const webhook = await docData<WhWebhook>(WH.webhooks, d.webhookId || submission?.webhookId);
  const domain = await docData<WhDomain>(WH.domains, d.domainId || webhook?.domainId || submission?.domainId);
  const settings = await settingsFor(domain, webhook);

  let tpl: Pick<WhEmailTemplate, 'subject' | 'htmlBody' | 'textBody'> = DEFAULT_TEMPLATE;
  if (typeof d.templateId === 'string' && d.templateId) {
    const saved = await getTemplate(d.templateId);
    if (!saved && d.htmlBody === undefined) throw new HttpsError('not-found', 'That email template no longer exists.');
    if (saved) tpl = saved;
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  tpl = {
    subject: str(d.subject) ?? tpl.subject,
    htmlBody: str(d.htmlBody) ?? tpl.htmlBody,
    textBody: str(d.textBody) ?? tpl.textBody,
  };

  const data: MergeData = submission ? mergeDataFor(submission, domain, webhook) :
    {...SAMPLE_LEAD, domain_name: domain?.name || SAMPLE_LEAD.domain_name, webhook_name: webhook?.formName || SAMPLE_LEAD.form_name,
      form_name: webhook?.formName || SAMPLE_LEAD.form_name, submitted_at: formatNy(Date.now()),
      lead_url: 'https://tigoniot.com/wh/submissions'};
  const rendered = renderEmail(tpl, data);
  try {
    const r = await sendMailVia([d.integrationId], settings, {
      to, subject: '[TEST] ' + rendered.subject, html: rendered.html, text: rendered.text,
      replyTo: settings.emailReplyTo || undefined,
    }, {messageId: `<wh.test.${randomBytes(8).toString('hex')}@tigoniot.com>`});
    return {ok: true, messageId: r.messageId};
  } catch (e) {
    const err = e instanceof WhMailError ? e : classify(e);
    throw new HttpsError('failed-precondition', err.message);
  }
});
