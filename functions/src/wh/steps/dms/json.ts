// Webhook Flows — generic JSON DMS adapter: POSTs the normalized lead.
import type {DmsAdapter} from './types';
import {DmsError} from './types';
import {postToDms} from './http';

export const jsonAdapter: DmsAdapter = {
  name: 'json',
  async send(lead, _ctx, integration, secrets) {
    const c = (integration.config || {}) as Record<string, unknown>;
    if (!c.url) throw new DmsError(`DMS "${integration.name || integration.id}" has no URL. Fix it in Settings → Integrations.`, false);
    const r = await postToDms(c.url, JSON.stringify({lead, source: 'TIGON IOT Webhook Flows'}), 'application/json', secrets, `json-${lead.submissionId}`);
    return {leadId: r.leadId || `json-${lead.submissionId}`, response: {delivery: 'http', ...r.response}};
  },
};
