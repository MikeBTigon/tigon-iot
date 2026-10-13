// Insights — credit applications.
//   mpCreditApi   public HTTPS (Hosting rewrite /api/credit/** → mpCreditApi, us-central1):
//                   GET  /api/credit/info?store=   → store name/phone + consent wording
//                   POST /api/credit/submit        → validates, caps, writes mp_credit_apps, attaches/creates the lead
//                 Signed-in team members may send "Authorization: Bearer <Firebase ID token>" (filling it in with a
//                 customer at the store): their IP is not capped and the application is marked as entered by them.
//   mpCreditSend  callable (team) {appId, lenderEmail, pdfBase64} → emails the PDF summary to a lender listed in
//                 mp_settings/credit {lenders: [{name, email}]} and records sentAt / sentTo on the application.
// No Social Security numbers or dates of birth are ever stored: the lender asks for those securely.
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall, onRequest} from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {FieldValue} from 'firebase-admin/firestore';
import {STORE_BY_ID} from '../mpShare';
import {C, db, loadPeople, managersFor, notify, nyDateKey, prettyPhone} from '../sales/util';
import type {Json, Person} from '../sales/util';
import {
  CONSENT_TEXT, CreditError, IP_DAILY_CAP, IP_MINUTE_CAP, MAX_BODY_BYTES, PHONE_DAILY_CAP, capDocId, clientIp, nextCount,
  noteLine, storeIdOf, stripUndefined, validateCreditApp,
} from './creditCore';
import type {CreditAppInput} from './creditCore';
import {phoneVariants} from './phone';
import {callerOf} from './people';
import {esc, sendWithAttachments} from './mail';

export const CREDIT_APPS = 'mp_credit_apps';
const OPEN = new Set(['new', 'talking']);
const MAX_PDF_BYTES = 3 * 1024 * 1024;

/** Adds one to a counter in mp_meta; true while it is at or under the cap. */
async function bump(id: string, period: string, cap: number, ttlMs: number): Promise<boolean> {
  const ref = db().collection(C.meta).doc(id);
  const n = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const c = nextCount(s.exists ? s.data() : undefined, period);
    tx.set(ref, {period, count: c, expireAt: Date.now() + ttlMs});
    return c;
  });
  return n <= cap;
}

const appendNote = (notes: unknown, line: string) => {
  const cur = String(notes || '').trim();
  const stamp = new Date().toLocaleDateString('en-US', {timeZone: 'America/New_York', month: 'short', day: 'numeric'});
  return `${cur ? `${cur}\n` : ''}${stamp}: ${line}`.slice(-4000);
};

function pickOwner(people: Person[], storeId: string, hint?: string): string {
  if (hint && people.some((p) => p.uid === hint)) return hint;
  return managersFor(people, storeId || undefined)[0]?.uid || people.find((p) => p.role === 'admin')?.uid || '';
}

/** Lead from the link, else the most recently updated open lead with this phone, else a new website lead. */
export async function attachLead(a: CreditAppInput, appId: string, staffUid?: string): Promise<{leadId: string; ownerUid: string; created: boolean}> {
  const col = db().collection(C.leads);
  let target: {id: string; data: Json} | null = null;
  if (a.leadId) {
    const s = await col.doc(a.leadId).get();
    if (s.exists) target = {id: s.id, data: s.data() || {}};
  }
  if (!target) {
    const snap = await col.where('phone', 'in', phoneVariants(a.phone)).limit(50).get();
    for (const d of snap.docs) {
      if (!OPEN.has(String(d.get('status') || 'new'))) continue;
      const at = Number(d.get('updatedAt') || d.get('createdAt') || 0);
      if (!target || at > Number(target.data.updatedAt || target.data.createdAt || 0)) target = {id: d.id, data: d.data()};
    }
  }
  const line = noteLine(a);
  const now = Date.now();
  if (target) {
    // Existing lead: only add a note (never overwrite what the team typed).
    await col.doc(target.id).update({notes: appendNote(target.data.notes, line), updatedAt: now});
    const ownerUid = String(target.data.ownerUid || '');
    return {leadId: target.id, ownerUid, created: false};
  }
  const people = await loadPeople();
  const ownerUid = pickOwner(people, a.storeId || '', staffUid);
  const ref = col.doc();
  await ref.set(stripUndefined({
    name: `${a.firstName} ${a.lastName}`.trim(), phone: prettyPhone(a.phone), email: a.email || '', channel: 'website', source: 'credit_app',
    status: 'new', ownerUid, locationId: a.storeId || '', notes: appendNote('', line), cartId: a.cartId || undefined,
    cartTitle: a.cartWanted || undefined, creditAppId: appId, smsConsent: true, createdAt: now, updatedAt: now,
  }));
  return {leadId: ref.id, ownerUid, created: true};
}

async function staffUidFrom(authHeader: string): Promise<string> {
  const m = /^Bearer\s+(.+)$/i.exec(authHeader || '');
  if (!m) return '';
  try {
    const t = await admin.auth().verifyIdToken(m[1]);
    const u = await db().collection(C.users).doc(t.uid).get();
    return u.exists ? t.uid : '';
  } catch {
    return '';
  }
}

function storeInfo(id: string) {
  const s = STORE_BY_ID[id] || STORE_BY_ID.T0;
  return {id: s.id, name: s.name, phone: s.phone};
}

/** Handles one request; exported for tests. */
export async function handleCredit(i: {method: string; path: string; query: Record<string, string>; body: unknown; bodyBytes: number; ip: string; auth: string}):
  Promise<{status: number; body: unknown}> {
  const parts = i.path.split('/').filter(Boolean);
  const k = parts.indexOf('credit');
  const action = (k >= 0 ? parts[k + 1] : parts[0]) || '';
  const minute = String(Math.floor(Date.now() / 60000));
  if (!(await bump(capDocId('ipmin', i.ip, minute), minute, IP_MINUTE_CAP, 3600_000))) {
    throw new CreditError(429, 'Too many tries — please wait a minute and try again.');
  }
  if (action === 'info' && i.method === 'GET') {
    return {status: 200, body: {store: storeInfo(storeIdOf(i.query.store)), consentText: CONSENT_TEXT}};
  }
  if (action !== 'submit' || i.method !== 'POST') throw new CreditError(404, 'Not found');
  if (i.bodyBytes > MAX_BODY_BYTES) throw new CreditError(413, 'That is too much text. Please shorten your notes and try again.');
  const app = validateCreditApp(i.body);
  const staffUid = await staffUidFrom(i.auth);
  const day = nyDateKey(Date.now());
  const DAY = 36 * 3600_000;
  if (!staffUid && !(await bump(capDocId('ip', i.ip, day), day, IP_DAILY_CAP, DAY))) {
    throw new CreditError(429, 'We already received several applications from this connection today. Please call us to finish.');
  }
  if (!(await bump(capDocId('phone', app.phone, day), day, PHONE_DAILY_CAP, DAY))) {
    throw new CreditError(429, 'We already have your application from today. A team member will reach out soon — or give us a call.');
  }
  const now = Date.now();
  const ref = db().collection(CREDIT_APPS).doc();
  const {leadId: _l, consent: _c, ...fields} = app;
  void _l;
  void _c;
  await ref.set(stripUndefined({
    ...fields, consent: true, consentText: CONSENT_TEXT, consentAt: now, status: 'new', source: staffUid ? 'staff' : 'public',
    createdBy: staffUid || undefined, createdAt: now, updatedAt: now,
  }));
  const lead = await attachLead(app, ref.id, staffUid || undefined);
  await ref.update(stripUndefined({leadId: lead.leadId, ownerUid: lead.ownerUid || undefined}));
  const name = `${app.firstName} ${app.lastName}`;
  const text = `${name} sent a credit application (income $${app.monthlyIncome.toLocaleString('en-US')}/mo). Phone ${prettyPhone(app.phone)}. ` +
    'Open Credit applications to send it to a lender.';
  const targets = new Set<string>([lead.ownerUid]);
  if (!lead.ownerUid) for (const p of managersFor(await loadPeople(), app.storeId)) targets.add(p.uid);
  await Promise.all([...targets].filter(Boolean).map((uid) =>
    notify(uid, 'Credit application', text, {source: 'credit_app', leadId: lead.leadId, creditAppId: ref.id})));
  logger.info('credit app received', {id: ref.id, leadId: lead.leadId, created: lead.created, staff: !!staffUid});
  return {status: 200, body: {ok: true, id: ref.id, store: storeInfo(app.storeId || '')}};
}

export const mpCreditApi = onRequest({region: 'us-central1', memory: '256MiB', timeoutSeconds: 30, maxInstances: 10}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).send('');
    return;
  }
  const bodyBytes = req.rawBody ? req.rawBody.length : Number(req.headers['content-length'] || 0);
  try {
    const query = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(Array.isArray(v) ? v[0] : v ?? '')]));
    const out = await handleCredit({
      method: req.method, path: req.path, query, body: req.body, bodyBytes, ip: clientIp(req.headers, req.ip || ''),
      auth: String(req.headers.authorization || ''),
    });
    res.status(out.status).json(out.body);
  } catch (e) {
    if (e instanceof CreditError) {
      res.status(e.status).json({error: e.message});
      return;
    }
    logger.error('mpCreditApi failed', e);
    res.status(500).json({error: 'Something went wrong. Please call us instead.'});
  }
});

// ---------------------------------------------------------------------------
// Send to a lender
// ---------------------------------------------------------------------------

const money = (n: unknown) => (Number(n) ? `$${Math.round(Number(n)).toLocaleString('en-US')}` : '');
const dur = (y: unknown, m: unknown) => [Number(y) ? `${Number(y)} yr` : '', Number(m) ? `${Number(m)} mo` : ''].filter(Boolean).join(' ') || '';
const HOUSING_LABEL: Record<string, string> = {own: 'Owns', rent: 'Rents', family: 'Lives with family', other: 'Other'};

/** Label/value rows for the email body (matches the PDF summary). */
export function summaryRows(a: Json): Array<[string, string]> {
  const co = (a.coApplicant || null) as Json | null;
  const rows: Array<[string, string]> = [
    ['Name', `${a.firstName || ''} ${a.lastName || ''}`.trim()],
    ['Phone', prettyPhone(a.phone)],
    ['Email', String(a.email || '')],
    ['Address', [a.street, a.unit, `${a.city || ''}, ${a.state || ''} ${a.zip || ''}`].filter(Boolean).join(', ')],
    ['Time at address', dur(a.yearsAtAddress, a.monthsAtAddress)],
    ['Housing', `${HOUSING_LABEL[String(a.housing)] || ''}${a.housingPayment ? ` · ${money(a.housingPayment)}/mo` : ''}`],
    ['Employer', String(a.employer || '')],
    ['Job title', String(a.jobTitle || '')],
    ['Time on job', dur(a.yearsOnJob, a.monthsOnJob)],
    ['Monthly income', money(a.monthlyIncome)],
    ['Other income', a.otherIncome ? `${money(a.otherIncome)}/mo${a.otherIncomeSource ? ` (${a.otherIncomeSource})` : ''}` : ''],
    ['Cart wanted', String(a.cartWanted || '')],
    ['Down payment', money(a.downPayment)],
  ];
  if (co) {
    rows.push(
      ['Co-applicant', `${co.firstName || ''} ${co.lastName || ''}`.trim() + (co.relationship ? ` (${co.relationship})` : '')],
      ['Co-applicant phone / email', [co.phone ? prettyPhone(co.phone) : '', co.email || ''].filter(Boolean).join(' · ')],
      ['Co-applicant employer', [co.employer, co.jobTitle, dur(co.yearsOnJob, co.monthsOnJob)].filter(Boolean).join(' · ')],
      ['Co-applicant monthly income', money(co.monthlyIncome)],
    );
  }
  return rows.filter(([, v]) => v);
}

export const mpCreditSend = onCall({timeoutSeconds: 60, memory: '256MiB'}, async (req) => {
  const me = await callerOf(req);
  const d = (req.data || {}) as Json;
  const appId = typeof d.appId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(d.appId) ? d.appId : '';
  if (!appId) throw new HttpsError('invalid-argument', 'Pick an application.');
  const lenderEmail = String(d.lenderEmail || '').trim().toLowerCase();
  const settings = (await db().collection('mp_settings').doc('credit').get()).data() || {};
  const lenders = (Array.isArray(settings.lenders) ? settings.lenders : []) as Array<{name?: string; email?: string}>;
  const lender = lenders.find((l) => String(l.email || '').trim().toLowerCase() === lenderEmail);
  if (!lender) throw new HttpsError('invalid-argument', 'Pick a lender from the list (an admin adds them on the Credit applications page).');
  const b64 = typeof d.pdfBase64 === 'string' ? d.pdfBase64.replace(/^data:[^,]*,/, '') : '';
  const pdf = Buffer.from(b64, 'base64');
  if (!pdf.length || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 4).toString('latin1') !== '%PDF') {
    throw new HttpsError('invalid-argument', 'The PDF summary could not be made. Try again.');
  }
  const ref = db().collection(CREDIT_APPS).doc(appId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That application was not found.');
  const a = snap.data() || {};
  const name = `${a.firstName || ''} ${a.lastName || ''}`.trim();
  const store = STORE_BY_ID[String(a.storeId || me.location || '')];
  const rows = summaryRows(a);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:640px">
<p>Hello${lender.name ? ` ${esc(lender.name)}` : ''},</p>
<p>Please find attached a credit application from <b>${esc(name)}</b>${store ? ` at TIGON Golf Carts ${esc(store.name)}` : ''}.
The customer authorized us to share it to find financing. We did <b>not</b> collect a Social Security number or date of birth — please get those from the customer securely.</p>
<table cellspacing="0" style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) =>
    `<tr><td style="padding:3px 12px 3px 0;color:#666;vertical-align:top">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`).join('')}</table>
<p style="margin-top:16px">Questions? Reply to this email or call ${esc(me.name || 'us')}${store ? ` at ${esc(store.phone)}` : ''}.</p></div>`;
  const textBody = [`Credit application: ${name}`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '',
    'No SSN or date of birth was collected — please get those from the customer securely.'].join('\n');
  try {
    await sendWithAttachments({
      to: [String(lender.email)], replyTo: me.email || undefined,
      subject: `Credit application — ${name}${store ? ` (TIGON ${store.name})` : ''}`, html, text: textBody,
    }, [{filename: `credit-application-${name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() || appId}.pdf`, content: pdf, contentType: 'application/pdf'}]);
  } catch (e) {
    logger.error('mpCreditSend: email failed', {appId, error: (e as Error).message});
    throw new HttpsError('failed-precondition', (e as Error).message || 'The email could not be sent.');
  }
  const now = Date.now();
  const sentTo = {name: String(lender.name || ''), email: String(lender.email)};
  await ref.update({
    status: 'sent', sentAt: now, sentTo, lender: sentTo.name || sentTo.email, sentBy: me.uid, sentByName: me.name, updatedAt: now,
    sendHistory: FieldValue.arrayUnion({at: now, ...sentTo, by: me.uid}),
  });
  if (a.leadId) {
    const lr = db().collection(C.leads).doc(String(a.leadId));
    const ls = await lr.get();
    if (ls.exists) await lr.update({notes: appendNote(ls.get('notes'), `Credit application sent to ${sentTo.name || sentTo.email}.`), updatedAt: now});
  }
  logger.info('credit app sent', {appId, by: me.uid});
  return {ok: true, sentAt: now};
});
