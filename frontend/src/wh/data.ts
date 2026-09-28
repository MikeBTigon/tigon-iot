/** Webhook Flows — Firestore/callable helpers shared by every admin page. */
import { useEffect, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc,
} from 'firebase/firestore';
import type { QueryConstraint } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { HOOK_PATH } from './types';

/** Live collection (optionally filtered). Returns undefined while loading. */
export function useWhCollection<T extends { id: string }>(
  name: string, constraints: QueryConstraint[] = [], deps: unknown[] = [],
): { rows: T[] | undefined; error: string } {
  const key = JSON.stringify([name, ...deps]);
  const [state, setState] = useState<{ key: string; rows: T[]; error: string } | null>(null);
  useEffect(() => onSnapshot(
    query(collection(db, name), ...constraints),
    (snap) => setState({ key, rows: snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T), error: '' }),
    (e) => setState({ key, rows: [], error: e.message }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers name + the caller's deps
  ), [key]);
  return state?.key === key ? { rows: state.rows, error: state.error } : { rows: undefined, error: '' };
}

/** Live single document. undefined = loading, null = missing. */
export function useWhDoc<T extends { id: string }>(name: string, id: string | undefined): T | null | undefined {
  const key = `${name}/${id || ''}`;
  const [state, setState] = useState<{ key: string; row: T | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, name, id),
      (s) => setState({ key, row: s.exists() ? ({ ...s.data(), id: s.id } as T) : null }),
      () => setState({ key, row: null }),
    );
  }, [name, id, key]);
  if (!id) return null;
  return state?.key === key ? state.row : undefined;
}

/** Firestore rejects undefined values; drop them (recursively for plain objects). */
export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) if (val !== undefined) out[k] = clean(val);
    return out as T;
  }
  return v;
}

/** Create (id omitted → auto id) or overwrite a document; sets createdAt/updatedAt. Returns the id. */
export async function saveWh(name: string, data: Record<string, unknown>, id?: string): Promise<string> {
  const now = Date.now();
  const body = clean({ ...data, updatedAt: now, createdAt: data.createdAt ?? now });
  delete (body as Record<string, unknown>).id;
  if (id) { await setDoc(doc(db, name, id), body); return id; }
  return (await addDoc(collection(db, name), body)).id;
}

export async function patchWh(name: string, id: string, data: Record<string, unknown>) {
  await updateDoc(doc(db, name, id), clean({ ...data, updatedAt: Date.now() }));
}

export const removeWh = (name: string, id: string) => deleteDoc(doc(db, name, id));

/** Call a Webhook Flows Cloud Function (whReplay, whTestEmail, whTestWebhook, …). */
export async function callWh<T = unknown>(name: string, data: Record<string, unknown>): Promise<T> {
  const res = await httpsCallable(functions, name)(data);
  return res.data as T;
}

/** Public URL a website posts to. Always the production host, so snippets work from any site. */
export const PUBLIC_HOST = 'https://tigoniot.com';
export const hookUrl = (key: string) => `${PUBLIC_HOST}${HOOK_PATH}${key}`;

export const fmtTime = (ms?: number) => (ms ? new Date(ms).toLocaleString() : '—');

/** Split "a@x.com, b@y.com" into a clean list. */
export const splitList = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
