// Texting phone (Android phone app): this phone sends the store's texts to customers from its own number.
// The native side (SmsSender / SmsPlugin "TigonSms") checks in every 30 seconds through the notification echo
// connection (mpEcho), picks up queued texts, sends them and reports back.
import { registerPlugin } from '@capacitor/core';
import { isNativeApp, nativePlatform } from './platform';

export interface SmsStatus {
  /** The phone has a SIM / can text at all. */
  supported: boolean;
  permission: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
  isTextingPhone: boolean;
  canSend: boolean;
  /** Android "Notification access" for TIGON IOT (the background check-in runs inside the listener). */
  notificationAccess: boolean;
  echoConfigured: boolean;
  missedCalls: boolean;
  waiting: number;
  toReport: number;
  sentCount: number;
  lastSentAt: number;
  lastPingAt: number;
  lastError: string;
}

interface SmsPlugin {
  getStatus(): Promise<SmsStatus>;
  requestPermission(): Promise<SmsStatus>;
  setTextingPhone(o: { enabled: boolean }): Promise<SmsStatus>;
  setMissedCalls(o: { enabled: boolean }): Promise<SmsStatus>;
  checkNow(): Promise<SmsStatus>;
}

export const TigonSms = registerPlugin<SmsPlugin>('TigonSms');

/** Only the Android app can send texts. */
export const smsSupported = () => isNativeApp() && nativePlatform() === 'android';

/** Status, or null on the website / an older app version without texting. */
export async function smsStatus(): Promise<SmsStatus | null> {
  if (!smsSupported()) return null;
  try {
    return await TigonSms.getStatus();
  } catch {
    return null; // app too old (plugin missing)
  }
}

/** Turns forwarding of missed calls on/off on this phone (for missed-call text-back). Safe to call on every start. */
export async function syncMissedCalls(enabled: boolean): Promise<void> {
  if (!smsSupported()) return;
  try {
    await TigonSms.setMissedCalls({ enabled });
  } catch {
    // older app version
  }
}
