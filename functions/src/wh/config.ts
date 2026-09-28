// Webhook Flows — config loading with a small in-memory cache (thousands of webhooks, one warm instance).
import * as admin from 'firebase-admin';
import {WH} from './types';
import type {WhDomain, WhFlow, WhGlobalSettings, WhSettings, WhWebhook} from './types';
import {resolveSettings} from './shared';

export const CONFIG_TTL_MS = 60_000;

export const db = () => admin.firestore();

export interface WhConfig {
  webhook: WhWebhook | null;
  domain: WhDomain | null;
  /** The webhook's own flow or its template flow. */
  flow: WhFlow | null;
  global: WhGlobalSettings;
  master: WhFlow | null;
  /** Fully resolved settings (global → master → domain → webhook flow → webhook). */
  settings: WhSettings;
  /** HMAC secret, only loaded when webhook.hmacRequired. */
  hmacSecret?: string;
}

interface Entry<T> {value: T; at: number}
const docCache = new Map<string, Entry<unknown>>();
const keyCache = new Map<string, Entry<string | null>>();

/** Drop every cached value (tests, or after an admin edit in the same instance). */
export function clearConfigCache() {
  docCache.clear();
  keyCache.clear();
}

async function cachedDoc<T>(collection: string, id: string | undefined | null, fresh = false): Promise<T | null> {
  if (!id) return null;
  const k = collection + '/' + id;
  const hit = docCache.get(k);
  if (!fresh && hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.value as T | null;
  const snap = await db().collection(collection).doc(id).get();
  const value = snap.exists ? ({...snap.data(), id: snap.id} as unknown as T) : null;
  docCache.set(k, {value, at: Date.now()});
  return value;
}

export const loadGlobal = async (fresh = false) =>
  (await cachedDoc<WhGlobalSettings>(WH.settings, 'global', fresh)) || {};

async function webhookIdForKey(key: string, fresh: boolean): Promise<string | null> {
  const hit = keyCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.value;
  const q = await db().collection(WH.webhooks).where('key', '==', key).limit(1).get();
  const id = q.empty ? null : q.docs[0].id;
  keyCache.set(key, {value: id, at: Date.now()});
  if (!q.empty) docCache.set(WH.webhooks + '/' + id, {value: {...q.docs[0].data(), id}, at: Date.now()});
  return id;
}

async function assemble(webhook: WhWebhook | null, ids: {domainId?: string; flowId?: string}, fresh: boolean): Promise<WhConfig> {
  const global = await loadGlobal(fresh);
  const [domain, flow, master] = await Promise.all([
    cachedDoc<WhDomain>(WH.domains, webhook?.domainId || ids.domainId, fresh),
    cachedDoc<WhFlow>(WH.flows, webhook?.flowId || ids.flowId, fresh),
    cachedDoc<WhFlow>(WH.flows, global.masterFlowId, fresh),
  ]);
  const {masterFlowId: _m, defaultFlowId: _d, retentionDays: _r, failureSpikePerHour: _f, ...globalSettings} = global;
  void _m; void _d; void _r; void _f;
  const settings = resolveSettings(globalSettings as WhSettings, master?.settings, domain?.settings, flow?.settings, webhook?.settings);
  const cfg: WhConfig = {webhook, domain, flow, global, master, settings};
  if (webhook?.hmacRequired) {
    const s = await cachedDoc<{secret?: string}>(WH.integrationSecrets, 'webhook_' + webhook.id, fresh);
    cfg.hmacSecret = s?.secret || '';
  }
  return cfg;
}

/** Config for a public webhook key (null = unknown key). */
export async function loadConfigByKey(key: string, fresh = false): Promise<WhConfig | null> {
  const id = await webhookIdForKey(key, fresh);
  if (!id) return null;
  const webhook = await cachedDoc<WhWebhook>(WH.webhooks, id, fresh);
  if (!webhook || webhook.key !== key) return null;
  return assemble(webhook, {}, fresh);
}

/** Config for a submission (falls back to its stored domain/flow when the webhook was deleted). */
export async function loadConfigForSubmission(sub: {webhookId?: string; domainId?: string; flowId?: string}, fresh = false) {
  const webhook = await cachedDoc<WhWebhook>(WH.webhooks, sub.webhookId, fresh);
  return assemble(webhook, {domainId: sub.domainId, flowId: sub.flowId}, fresh);
}

export const loadWebhook = (id: string, fresh = false) => cachedDoc<WhWebhook>(WH.webhooks, id, fresh);
export const loadFlow = (id: string | undefined, fresh = false) => cachedDoc<WhFlow>(WH.flows, id, fresh);
