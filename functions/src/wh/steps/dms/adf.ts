// Webhook Flows — ADF 1.0 (Auto-lead Data Format) XML: the standard lead format most DMS/CRMs accept by HTTP or email.
import {sendMailVia} from '../email';
import {errMsg, isValidEmail, toList} from '../util';
import type {DmsAdapter, NormalizedLead} from './types';
import {DmsError} from './types';
import {postToDms} from './http';

export const xmlEscape = (s: unknown) => String(s ?? '')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const el = (tag: string, value: unknown, attrs = '') => {
  const v = String(value ?? '').trim();
  return v ? `<${tag}${attrs}>${xmlEscape(v)}</${tag}>` : '';
};

export function buildAdf(lead: NormalizedLead, opts: {vendorName?: string; providerName?: string; providerUrl?: string; vehicleStatus?: string} = {}): string {
  const status = opts.vehicleStatus === 'new' || opts.vehicleStatus === 'used' ? ` status="${opts.vehicleStatus}"` : '';
  const comments = [
    lead.comments,
    lead.formName ? `Form: ${lead.formName}` : '',
    lead.pageUrl ? `Page: ${lead.pageUrl}` : '',
    ...lead.images.map((u, i) => `Image ${i + 1}: ${u}`),
    lead.source.utm_source ? `Source: ${[lead.source.utm_source, lead.source.utm_medium, lead.source.utm_campaign].filter(Boolean).join(' / ')}` : '',
  ].filter(Boolean).join('\n');
  const nameXml = lead.firstName || lead.lastName ?
    el('name', lead.firstName, ' part="first"') + el('name', lead.lastName, ' part="last"') :
    `<name part="full">${xmlEscape(lead.email || lead.phone1 || 'Website lead')}</name>`;
  const address = lead.address || lead.zipCode ?
    `<address>${el('street', lead.address, ' line="1"')}${el('postalcode', lead.zipCode)}</address>` : '';
  const vehicle = `<vehicle interest="buy"${status}>${el('year', lead.year)}${el('make', lead.brand)}${el('model', lead.model)}` +
    `${el('vin', lead.vin)}${el('stock', lead.sku)}</vehicle>`;
  return '<?xml version="1.0" encoding="UTF-8"?>\n<?adf version="1.0"?>\n<adf>\n<prospect status="new">\n' +
    `<id sequence="1" source="TIGON IOT">${xmlEscape(lead.submissionId)}</id>\n` +
    `<requestdate>${new Date(lead.receivedAt || Date.now()).toISOString()}</requestdate>\n` +
    `${vehicle}\n` +
    `<customer><contact>${nameXml}${el('email', lead.email)}${el('phone', lead.phone1, ' type="voice"')}` +
    `${el('phone', lead.phone2, ' type="voice"')}${address}</contact>${el('comments', comments)}</customer>\n` +
    `<vendor><vendorname>${xmlEscape(opts.vendorName || lead.domainName || 'TIGON')}</vendorname></vendor>\n` +
    `<provider><name part="full">${xmlEscape(opts.providerName || 'TIGON IOT Webhook Flows')}</name>` +
    `${el('url', opts.providerUrl || lead.domainUrl || lead.pageUrl)}</provider>\n` +
    '</prospect>\n</adf>\n';
}

export const adfAdapter: DmsAdapter = {
  name: 'adf',
  async send(lead, ctx, integration, secrets) {
    const c = (integration.config || {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const xml = buildAdf(lead, {vendorName: str(c.vendorName), providerName: str(c.providerName), providerUrl: str(c.providerUrl),
      vehicleStatus: str(c.vehicleStatus)});
    const delivery = str(c.delivery) || (c.url ? 'http' : 'email');
    if (delivery === 'email') {
      const to = toList(c.emailTo).filter(isValidEmail);
      if (!to.length) throw new DmsError(`DMS "${integration.name || integration.id}" has no lead email address. Fix it in Settings → Integrations.`, false);
      try {
        const r = await sendMailVia([c.smtpIntegrationId], ctx.settings, {
          to, subject: (lead.isTest ? '[TEST] ' : '') + 'ADF Lead', text: xml, html: '',
        });
        return {leadId: `adf-${lead.submissionId}`, response: {delivery: 'email', to: to.length, messageId: r.messageId}};
      } catch (e) {
        throw new DmsError(errMsg(e), (e as {retryable?: boolean}).retryable !== false);
      }
    }
    const r = await postToDms(c.url, xml, 'application/xml', secrets, `adf-${lead.submissionId}`);
    return {leadId: r.leadId || `adf-${lead.submissionId}`, response: {delivery: 'http', ...r.response}};
  },
};
