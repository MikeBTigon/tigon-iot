// Notification echo (Android phone app): the native listener (EchoListenerService) forwards this phone's
// notifications to the dashboard through the mpEcho function, labeled with the phone's number (#0003).
import { registerPlugin } from '@capacitor/core';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { isNativeApp, nativePlatform } from './platform';
import { deviceDocId } from './deviceSession';

export interface EchoStatus {
  access: boolean;
  enabled: boolean;
  configured: boolean;
  deviceId: string;
  onlyFacebook: boolean;
  queued: number;
  lastSentAt: number;
  lastError: string;
}

interface EchoPlugin {
  configure(o: { deviceId?: string; secret?: string; endpoint?: string; enabled?: boolean; onlyFacebook?: boolean }): Promise<EchoStatus>;
  getStatus(): Promise<EchoStatus>;
  openAccessSettings(): Promise<void>;
  sendTest(): Promise<void>;
}

export const TigonEcho = registerPlugin<EchoPlugin>('TigonEcho');

export const echoSupported = () => isNativeApp() && nativePlatform() === 'android';

/** Makes sure the native listener has this phone's device id + echo secret. Safe to call on every app start. */
export async function ensureEcho(uid: string, force = false): Promise<EchoStatus | null> {
  if (!echoSupported()) return null;
  const deviceId = deviceDocId(uid);
  const status = await TigonEcho.getStatus();
  if (!force && status.deviceId === deviceId && status.configured) return status;
  const res = await httpsCallable<{ deviceId: string }, { deviceId: string; secret: string }>(functions, 'mpEchoRegister')({ deviceId });
  // First registration turns echo on; later ones keep the person's on/off choice.
  const enabled = status.deviceId === deviceId ? status.enabled || force : true;
  return TigonEcho.configure({ deviceId: res.data.deviceId, secret: res.data.secret, enabled });
}
