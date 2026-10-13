// Insights — email: reuses the Webhook Flows email server (wh_settings/global + the SMTP integration in
// Webhook Flows → Settings → Integrations), the same one the phone online reports and change requests use.
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import {sendMail, smtpSetup, NO_SMTP_MESSAGE} from '../wh/steps/email';
import type {MailMessage} from '../wh/steps/email';
import {getIntegrationSecrets, pickIntegration} from '../wh/steps/cache';
import type {WhSettings} from '../wh/types';

export {NO_SMTP_MESSAGE};

export async function mailSettings(): Promise<WhSettings> {
  return ((await admin.firestore().collection('wh_settings').doc('global').get()).data() || {}) as WhSettings;
}

/** Plain email through the shared sender. */
export async function sendReport(msg: MailMessage): Promise<string> {
  const r = await sendMail(await mailSettings(), msg);
  return r.messageId;
}

export interface Attachment {filename: string; content: Buffer; contentType: string}

/** Email with attachments (the shared sender has none), using the same SMTP integration and settings. */
export async function sendWithAttachments(msg: MailMessage, attachments: Attachment[]): Promise<string> {
  const settings = await mailSettings();
  const integration = await pickIntegration('smtp', settings.smtpIntegrationId);
  if (!integration) throw new Error(NO_SMTP_MESSAGE);
  const setup = smtpSetup(integration, await getIntegrationSecrets(integration.id));
  if (!setup.host || !setup.fromEmail) throw new Error('The email server is missing its host or "From" address. Fix it in Webhook Flows → Settings → Integrations.');
  const t = nodemailer.createTransport({
    host: setup.host, port: setup.port, secure: setup.secure,
    auth: setup.user ? {user: setup.user, pass: setup.pass || ''} : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000,
  });
  try {
    const info = await t.sendMail({
      from: {name: (settings.emailFromName || setup.fromName || 'TIGON Golf Carts').replace(/["\r\n]/g, ''), address: setup.fromEmail},
      to: msg.to, cc: msg.cc, bcc: msg.bcc, replyTo: msg.replyTo,
      subject: msg.subject.replace(/[\r\n]+/g, ' ').slice(0, 250), html: msg.html, text: msg.text, attachments,
    });
    return String(info.messageId || '');
  } finally {
    t.close();
  }
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'}[c] as string));
