// Webhook Flows — TIGON IOT integration: create an MP Leads (CRM) lead, and IoT notifications (phone push).
import * as admin from 'firebase-admin';
import {renderTemplate} from '../shared';
import type {StepContext, StepResult} from '../engineTypes';
import {firstAdminUid} from './cache';
import {ctxMergeData, errMsg, fail, isTestSubmission, skip, toList} from './util';

const db = () => admin.firestore();
const ALREADY_EXISTS = 6;
const isAlreadyExists = (e: unknown) => (e as {code?: unknown}).code === ALREADY_EXISTS ||
  /already exists/i.test(errMsg(e));

export const leadDocId = (submissionId: string) => `wh_${submissionId}`;

async function ownerFor(ctx: StepContext): Promise<string | null> {
  const c = ctx.step.config || {};
  if (typeof c.ownerUid === 'string' && c.ownerUid) return c.ownerUid;
  if (ctx.settings.leadOwnerUid) return ctx.settings.leadOwnerUid;
  return firstAdminUid();
}

/** mp_leads document (CRM Lead shape) for a submission. */
export function leadDoc(ctx: StepContext, ownerUid: string, now: number) {
  const s = ctx.submission;
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
  const name = `${str(s.first_name)} ${str(s.last_name)}`.trim() || str(s.email) || str(s.phone1) || 'Website lead';
  const cartTitle = [str(s.brand), str(s.model)].filter(Boolean).join(' ');
  const site = ctx.domain?.name || '';
  const form = str(s.form_name) || ctx.webhook?.formName || '';
  const message = str(s.comments);
  const notes = [
    message,
    `From ${site || 'website'}${form ? ` (${form})` : ''}.`,
    str(s.vin_number) ? `VIN: ${str(s.vin_number)}` : '',
    str(s.sku_number) ? `SKU: ${str(s.sku_number)}` : '',
    str(s.phone2) ? `Phone 2: ${str(s.phone2)}` : '',
    str(s.zip_code) ? `ZIP: ${str(s.zip_code)}` : '',
    str(s.url) ? `Page: ${str(s.url)}` : '',
  ].filter(Boolean).join('\n');
  const doc: Record<string, unknown> = {
    name, phone: str(s.phone1), email: str(s.email), channel: 'website', source: 'website', status: 'new',
    ownerUid, notes, message, createdAt: now, updatedAt: now,
    whSubmissionId: s.id, whDomainId: s.domainId || '', whWebhookId: s.webhookId || '',
  };
  if (cartTitle) doc.cartTitle = cartTitle;
  for (const [k, v] of Object.entries({brand: s.brand, model: s.model, vin: s.vin_number, sku: s.sku_number, zipCode: s.zip_code})) {
    if (str(v)) doc[k] = str(v);
  }
  return doc;
}

export async function createLeadStep(ctx: StepContext): Promise<StepResult> {
  const c = ctx.step.config || {};
  if (isTestSubmission(ctx.submission)) return skip('test submission');
  if (ctx.settings.createLead === false && c.force !== true) return skip('lead creation is turned off in settings');
  const ownerUid = await ownerFor(ctx);
  if (!ownerUid) return fail('No lead owner — pick one in settings (TIGON IOT → Lead owner).', false);
  const id = leadDocId(ctx.submission.id);
  const ref = db().collection('mp_leads').doc(id);
  try {
    // create() (not set) so a replay never resets a lead the sales team already worked on.
    await ref.create(leadDoc(ctx, ownerUid, Date.now()));
    return {status: 'success', response: {mpLeadId: id, ownerUid, created: true}, patch: {mpLeadId: id}};
  } catch (e) {
    if (isAlreadyExists(e)) return {status: 'success', response: {mpLeadId: id, created: false}, patch: {mpLeadId: id}};
    return fail(`Could not create the lead: ${errMsg(e)}`, true);
  }
}

export const DEFAULT_NOTIFY_TEXT = 'New lead from {{domain_name}}: {{first_name}} {{last_name}} {{phone1}}';

export async function notifyStep(ctx: StepContext): Promise<StepResult> {
  const c = ctx.step.config || {};
  let uids = toList(c.uids);
  if (!uids.length) uids = toList(ctx.settings.notifyUids);
  if (!uids.length) {
    const owner = await ownerFor(ctx);
    if (owner) uids = [owner];
  }
  uids = uids.filter((u) => /^[A-Za-z0-9_-]{1,128}$/.test(u)).slice(0, 50);
  if (!uids.length) return fail('Nobody to notify — pick people in settings (TIGON IOT → Notify).', false);
  const tpl = typeof c.text === 'string' && c.text.trim() ? c.text : DEFAULT_NOTIFY_TEXT;
  const text = ((isTestSubmission(ctx.submission) ? '[TEST] ' : '') +
    renderTemplate(tpl, ctxMergeData(ctx), false).replace(/\s+/g, ' ').trim()).slice(0, 500);
  let created = 0;
  let existed = 0;
  const errors: string[] = [];
  await Promise.all(uids.map(async (uid) => {
    try {
      await db().collection('notifications').doc(`wh_${ctx.submission.id}_${uid}`).create({
        targetUserId: uid, sourceDeviceName: 'Webhook Flows', text, isHandled: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), source: 'wh_lead',
        whSubmissionId: ctx.submission.id, ...(ctx.submission.mpLeadId ? {leadId: ctx.submission.mpLeadId} : {}),
      });
      created++;
    } catch (e) {
      if (isAlreadyExists(e)) existed++;
      else errors.push(errMsg(e));
    }
  }));
  if (errors.length && !created && !existed) return fail(`Could not create notifications: ${errors[0]}`, true);
  return {status: 'success', response: {notified: created, alreadySent: existed, ...(errors.length ? {errors: errors.length} : {})}};
}
