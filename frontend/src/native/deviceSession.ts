// Phone-app device session: registers this install as a device of the signed-in user,
// sends a heartbeat while the app is open, and logs analytics events.
// On the website, events are logged with deviceId 'web' and nothing else happens.
import { addDoc, collection, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS, HEARTBEAT_MS } from '../mp/constants';
import type { MpEvent, MpEventType } from '../mp/types';
import { isNativeApp, nativePlatform } from './platform';

const INSTALL_KEY = 'tigon.installId';

export function installId(): string {
  let id = '';
  try {
    id = localStorage.getItem(INSTALL_KEY) || '';
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(INSTALL_KEY, id);
    }
  } catch {
    id = id || 'unknown';
  }
  return id;
}

/** One device doc per app install + user. */
export const deviceDocId = (uid: string) => `app_${installId()}_${uid}`;
export const deviceRef = (uid: string) => doc(db, 'devices', deviceDocId(uid));

let session: { uid: string; deviceId: string } | null = null;

/** Device id used for analytics: the phone's device doc, or 'web'. */
export function currentDeviceId(): string {
  return session?.deviceId || 'web';
}

async function deviceInfo() {
  try {
    const [{ Device }, { App }] = await Promise.all([import('@capacitor/device'), import('@capacitor/app')]);
    const [info, app] = await Promise.all([Device.getInfo(), App.getInfo()]);
    return {
      platform: info.platform,
      model: `${info.manufacturer} ${info.model}`.trim(),
      osVersion: info.osVersion,
      appVersion: `${app.version} (${app.build})`,
    };
  } catch {
    return { platform: nativePlatform(), model: '', osVersion: '', appVersion: '' };
  }
}

/** Ensures this phone has a device doc for the user (created with alerts off). */
export async function registerDevice(uid: string, email: string | null) {
  const ref = deviceRef(uid);
  const snap = await getDoc(ref);
  const info = await deviceInfo();
  if (!snap.exists()) {
    const label = info.platform === 'ios' ? 'iPhone' : 'Android';
    await setDoc(ref, {
      userId: uid,
      deviceName: `${email?.split('@')[0] || 'My'} ${label}${info.model ? ` · ${info.model}` : ''}`,
      deviceType: 'master',
      isActive: false,
      source: 'tigon-iot-app',
      installId: installId(),
      status: 'active',
      pairedAt: Date.now(),
      lastSeen: Date.now(),
      ...info,
    });
  } else {
    await updateDoc(ref, { lastSeen: Date.now(), ...info });
  }
  session = { uid, deviceId: ref.id };
}

export type DeviceState = 'ok' | 'revoked' | 'reassigned';

/** Heartbeat: updates lastSeen + today's active minutes; reports revocation/reassignment. */
export async function heartbeat(uid: string, minutes: number): Promise<DeviceState> {
  const ref = deviceRef(uid);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch {
    // Reading is denied once the device belongs to someone else.
    return 'reassigned';
  }
  if (!snap.exists()) return 'revoked';
  if (snap.get('status') === 'revoked') return 'revoked';
  if (snap.get('userId') !== uid) return 'reassigned';
  await updateDoc(ref, { lastSeen: Date.now() });
  if (minutes > 0) {
    const date = new Date().toISOString().slice(0, 10);
    await setDoc(
      doc(db, COLLECTIONS.deviceDays, `${ref.id}_${date.replace(/-/g, '')}`),
      { deviceId: ref.id, userId: uid, date, activeMinutes: increment(minutes), updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  return 'ok';
}

/** Starts the heartbeat loop; returns a stop function. */
export function startHeartbeat(uid: string, onEnded: (state: DeviceState) => void): () => void {
  if (!isNativeApp()) return () => undefined;
  let last = Date.now();
  const beat = async () => {
    if (document.visibilityState !== 'visible') return;
    const minutes = Math.min(Math.round((Date.now() - last) / 60000), HEARTBEAT_MS / 60000);
    last = Date.now();
    try {
      const state = await heartbeat(uid, minutes);
      if (state !== 'ok') onEnded(state);
    } catch (e) {
      console.warn('Heartbeat failed', e);
    }
  };
  const timer = setInterval(beat, HEARTBEAT_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      last = Date.now();
      beat();
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export function endDeviceSession() {
  session = null;
}

/** Logs an analytics event for the signed-in user on this device. Never throws. */
export async function logEvent(uid: string | undefined, type: MpEventType, extra: Partial<MpEvent> = {}) {
  if (!uid) return;
  try {
    const event: MpEvent = {
      type,
      userId: uid,
      deviceId: currentDeviceId(),
      platform: nativePlatform(),
      ts: Date.now(),
      ...extra,
    };
    // Firestore rejects undefined values.
    const clean = Object.fromEntries(Object.entries(event).filter(([, v]) => v !== undefined));
    await addDoc(collection(db, COLLECTIONS.events), clean);
  } catch (e) {
    console.warn('logEvent failed', type, e);
  }
}
