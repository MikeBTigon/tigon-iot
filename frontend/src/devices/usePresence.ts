import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import type { DeviceDoc } from '../mp/types';
import { DEFAULT_PRESENCE, loadOnline } from './presence';
import { loadPostings } from './postings';
import type { PostMap } from './postings';
import type { OnlineMap, PresenceSettings } from './presence';

/** Minimum hours a day, which weekdays count, and where reports go (mp_meta/presence). */
export function usePresenceSettings(): PresenceSettings {
  const [s, setS] = useState<PresenceSettings>(DEFAULT_PRESENCE);
  useEffect(() => onSnapshot(doc(db, 'mp_meta', 'presence'), (snap) => {
    const d = snap.data() || {};
    setS({
      minHours: Number(d.minHours) > 0 ? Number(d.minHours) : DEFAULT_PRESENCE.minHours,
      days: Array.isArray(d.days) && d.days.length ? d.days.map(Number) : DEFAULT_PRESENCE.days,
      reportTo: typeof d.reportTo === 'string' && d.reportTo ? d.reportTo : DEFAULT_PRESENCE.reportTo,
    });
  }, () => undefined), []);
  return s;
}

/** Every phone (managers). */
export function useAllDevices() {
  const [rows, setRows] = useState<DeviceDoc[] | undefined>(undefined);
  useEffect(() => onSnapshot(collection(db, 'devices'),
    (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DeviceDoc)),
    () => setRows([])), []);
  return rows;
}

/** Online days since `from` (everyone, or one person). Reloads when `reload` changes. */
export function useOnline(from: string, userId?: string, reload = 0) {
  const [state, setState] = useState<{ key: string; data?: OnlineMap; error: string } | null>(null);
  const key = `${from}|${userId || ''}|${reload}`;
  useEffect(() => {
    let live = true;
    loadOnline(from, userId)
      .then((data) => { if (live) setState({ key, data, error: '' }); })
      .catch((e) => { if (live) setState({ key, data: new Map(), error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [from, userId, key]);
  return state?.key === key ? state : { key, data: undefined, error: '' };
}

/** Email a report to the report address now. */
export async function sendPresenceReport(action: 'user' | 'allUsers' | 'overall', uid?: string) {
  const r = await httpsCallable(functions, 'mpPresenceReport')({ action, uid });
  return r.data as { sent: number; to: string };
}

export async function savePresenceSettings(s: PresenceSettings) {
  await httpsCallable(functions, 'mpPresenceReport')({ action: 'settings', ...s });
}

/** App phones that count for online hours. */
export const appPhones = (devices: DeviceDoc[] | undefined, userId?: string) =>
  (devices || []).filter((d) => d.source === 'tigon-iot-app' && d.status !== 'revoked' && (!userId || d.userId === userId));

/** Postings per device per day (everyone, or one person). */
export function usePostings(userId?: string) {
  const [state, setState] = useState<{ key: string; data?: PostMap; error: string } | null>(null);
  const key = userId || '*';
  useEffect(() => {
    let live = true;
    loadPostings(userId)
      .then((data) => { if (live) setState({ key, data, error: '' }); })
      .catch((e) => { if (live) setState({ key, data: new Map(), error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [userId, key]);
  return state?.key === key ? state : { key, data: undefined, error: '' };
}
