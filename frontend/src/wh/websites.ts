/** Webhook Flows — creating websites, webhooks and private flow copies. */
import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { saveWh } from './data';
import { randomKey } from './shared';
import { WH } from './types';
import type { FlowStep, WhDomain, WhFlow, WhSettings, WhWebhook } from './types';
import type { MpProfile } from '../mp/types';
import { writeAudit } from '../mp/audit';

export const PLATFORMS: Array<{ value: string; label: string }> = [
  { value: 'wordpress', label: 'WordPress' },
  { value: 'webflow', label: 'Webflow' },
  { value: 'wix', label: 'Wix' },
  { value: 'squarespace', label: 'Squarespace' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'custom', label: 'Custom HTML / other' },
];

/** "example.com/contact" → "https://example.com". */
export function normalizeSiteUrl(input: string): { url?: string; error?: string } {
  const raw = input.trim();
  if (!raw) return { error: 'Enter the website address.' };
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'The address must start with https://' };
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return { error: 'That does not look like a website address (e.g. https://example.com).' };
    return { url: u.origin };
  } catch {
    return { error: 'That does not look like a website address (e.g. https://example.com).' };
  }
}

/** Accepts a Google Sheet URL or a bare id. */
export function extractSheetId(input: string): string {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}

export const newStepId = () => `s_${randomKey(10)}`;

/** Copy steps with fresh ids; condition jumps are re-pointed at the copied steps. */
export function cloneSteps(steps: FlowStep[]): FlowStep[] {
  const ids = new Map(steps.map((s) => [s.id, newStepId()]));
  return steps.map((s) => {
    const config: Record<string, unknown> = JSON.parse(JSON.stringify(s.config || {}));
    if (s.type === 'condition') {
      for (const k of ['then', 'else']) {
        const v = config[k];
        if (typeof v === 'string' && ids.has(v)) config[k] = ids.get(v);
      }
    }
    return { ...s, id: ids.get(s.id) as string, config };
  });
}

/** Clone a flow as a private ('webhook') flow. Returns the new flow id. */
export async function cloneFlow(src: WhFlow, name: string): Promise<string> {
  return saveWh(WH.flows, {
    name,
    type: 'webhook',
    steps: cloneSteps(src.steps || []),
    settings: JSON.parse(JSON.stringify(src.settings || {})),
    forwardToMaster: true,
  });
}

export async function createWebhook(
  domainId: string, flowId: string, formName: string, profile: MpProfile | null | undefined, settings: WhSettings = {},
): Promise<{ id: string; key: string }> {
  const key = randomKey(32);
  const data: Omit<WhWebhook, 'id' | 'createdAt' | 'updatedAt'> = {
    key, domainId, flowId, formName: formName.trim() || 'Contact form', status: 'active', settings, fieldMap: {},
    hmacRequired: false, createdBy: profile?.uid || '',
  };
  const id = await saveWh(WH.webhooks, data as unknown as Record<string, unknown>);
  return { id, key };
}

export interface NewWebsiteInput {
  name: string;
  url: string;
  platform: string;
  /** MP Leads channel for this website's leads (default 'dba_website'). */
  leadChannel?: string;
  /** +1-xxx-xxx-xxxx or '' */
  phone?: string;
  locationId?: string;
  formName: string;
  /** 'shared' = use the template flow as is; 'copy' = make this website's own copy of it. */
  flowMode: 'shared' | 'copy';
  templateFlow: WhFlow;
  settings: WhSettings;
}

export interface NewWebsiteResult { domainId: string; webhookId: string; flowId: string; key: string }

/** Add Website: domain + (optional private flow) + first webhook + audit entry. */
export async function createWebsite(input: NewWebsiteInput, profile: MpProfile | null | undefined): Promise<NewWebsiteResult> {
  const domain: Omit<WhDomain, 'id' | 'createdAt' | 'updatedAt'> = {
    name: input.name.trim(), url: input.url, status: 'active', platform: input.platform, settings: input.settings,
    leadChannel: input.leadChannel || 'dba_website',
    phone: input.phone || '',
    locationId: input.locationId || '',
    createdBy: profile?.uid || '',
  };
  const domainId = await saveWh(WH.domains, domain as unknown as Record<string, unknown>);
  const flowId = input.flowMode === 'copy' ?
    await cloneFlow(input.templateFlow, `${input.name.trim()} — ${input.formName.trim() || 'Contact form'}`) :
    input.templateFlow.id;
  const { id: webhookId, key } = await createWebhook(domainId, flowId, input.formName, profile);
  await writeAudit(profile, 'wh_add_website', input.name.trim(),
    `${input.url} · form "${input.formName}" · ${input.flowMode === 'copy' ? 'own flow copy' : 'shared flow'} ${flowId}`);
  return { domainId, webhookId, flowId, key };
}

/** Move every MP Leads lead that came from this website to another channel. Returns how many changed. */
export async function relabelLeads(domainId: string, channel: string): Promise<number> {
  const snap = await getDocs(query(collection(db, 'mp_leads'), where('whDomainId', '==', domainId)));
  const docs = snap.docs.filter((d) => d.get('channel') !== channel);
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { channel, updatedAt: Date.now() }));
    await batch.commit();
  }
  return docs.length;
}
