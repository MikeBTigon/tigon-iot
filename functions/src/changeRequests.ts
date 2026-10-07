// "Request a change" (sidebar in the app): emails every admin and manager when someone sends a request.
import * as logger from 'firebase-functions/logger';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import {sendMail} from './wh/steps/email';
import {escapeHtml} from './wh/shared';
import type {WhSettings} from './wh/types';

const db = () => admin.firestore();
const PAGE = 'https://tigoniot.com/requests';
const KIND: Record<string, string> = {bug: 'Bug / problem', feature: 'New feature', other: 'Other'};
const PLATFORM: Record<string, string> = {web: 'website', android: 'Android app', ios: 'iPhone app'};

export const mpChangeRequestAlert = onDocumentCreated('change_requests/{id}', async (event) => {
  const r = event.data?.data();
  if (!r) return;
  const people = await db().collection('mp_users').where('role', 'in', ['admin', 'manager']).get();
  const to = Array.from(new Set(people.docs.map((d) => String(d.get('email') || '')).filter(Boolean)));
  if (!to.length) {
    logger.warn('change request: no admins or managers to email', {id: event.params.id});
    return;
  }
  const kind = KIND[String(r.kind)] || 'Request';
  const title = String(r.title || '');
  const from = String(r.createdByName || r.createdByEmail || 'Someone');
  const rows: Array<[string, string]> = [
    ['From', `${from}${r.createdByEmail && r.createdByEmail !== from ? ` (${r.createdByEmail})` : ''}`],
    ['Type', kind],
    ['Where in the app', String(r.where || '')],
    ['Sent from', PLATFORM[String(r.platform)] || String(r.platform || '')],
  ];
  const details = String(r.details || '');
  const settings = ((await db().collection('wh_settings').doc('global').get()).data() || {}) as WhSettings;
  try {
    await sendMail(settings, {
      to,
      replyTo: String(r.createdByEmail || ''),
      subject: `Change request: ${title} (${kind})`,
      html: `<p style="margin:0 0 12px"><strong>${escapeHtml(title)}</strong></p>` +
        (details ? `<p style="margin:0 0 12px">${escapeHtml(details).replace(/\n/g, '<br>')}</p>` : '') +
        `<table style="border-collapse:collapse;margin:0 0 16px">${rows.filter(([, v]) => v)
          .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>` +
        `<p style="margin:0"><a href="${PAGE}">Open Request a change in TIGON IOT</a></p>`,
      text: [title, details, '', ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), '', `Open: ${PAGE}`].join('\n'),
    });
    logger.info('change request emailed', {id: event.params.id, to: to.length});
  } catch (e) {
    logger.error('change request email failed', {id: event.params.id, error: (e as Error).message});
  }
});
