// Webhook Flows steps — small in-memory caches for integration docs, secrets and templates (60 s).
import * as admin from 'firebase-admin';
import {WH} from '../types';
import type {IntegrationType, WhEmailTemplate, WhIntegration} from '../types';

const TTL_MS = 60 * 1000;
const store = new Map<string, {at: number; value: unknown}>();

const db = () => admin.firestore();

/** Memoize an async lookup for 60 s (per function instance). */
export async function cached<T>(key: string, load: () => Promise<T>, ttlMs = TTL_MS): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  store.set(key, {at: Date.now(), value});
  return value;
}

/** Tests and "Save" hooks can drop everything. */
export function clearStepCache() {
  store.clear();
}

export function getIntegration(id: string): Promise<WhIntegration | null> {
  return cached(`int:${id}`, async () => {
    const snap = await db().collection(WH.integrations).doc(id).get();
    return snap.exists ? ({...(snap.data() as object), id: snap.id} as WhIntegration) : null;
  });
}

export function getIntegrationSecrets(id: string): Promise<Record<string, string>> {
  return cached(`sec:${id}`, async () => {
    const snap = await db().collection(WH.integrationSecrets).doc(id).get();
    return (snap.exists ? snap.data() : {}) as Record<string, string>;
  });
}

/** Oldest integration of a type (single-field query; sorted in memory). */
export function firstIntegration(type: IntegrationType): Promise<WhIntegration | null> {
  return cached(`first:${type}`, async () => {
    const snap = await db().collection(WH.integrations).where('type', '==', type).limit(50).get();
    const list = snap.docs.map((d) => ({...(d.data() as object), id: d.id} as WhIntegration));
    list.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    return list[0] || null;
  });
}

/** Integration by explicit id (unless empty/'inherit'), then the settings id, then the first of that type. */
export async function pickIntegration(type: IntegrationType, ...ids: Array<unknown>): Promise<WhIntegration | null> {
  for (const id of ids) {
    if (typeof id === 'string' && id && id !== 'inherit') {
      const found = await getIntegration(id);
      if (found) return found;
    }
  }
  return firstIntegration(type);
}

export function getTemplate(id: string): Promise<WhEmailTemplate | null> {
  return cached(`tpl:${id}`, async () => {
    const snap = await db().collection(WH.templates).doc(id).get();
    return snap.exists ? ({...(snap.data() as object), id: snap.id} as WhEmailTemplate) : null;
  });
}

/** Oldest admin in mp_users (default lead owner). */
export function firstAdminUid(): Promise<string | null> {
  return cached('firstAdmin', async () => {
    const snap = await db().collection('mp_users').where('role', '==', 'admin').limit(50).get();
    const list = snap.docs.map((d) => ({id: d.id, at: Number(d.get('createdAt') || 0)}));
    list.sort((a, b) => a.at - b.at);
    return list[0]?.id || null;
  });
}
