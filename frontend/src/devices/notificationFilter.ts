// Which notifications the Dashboard shows, shared by the "This Device" and "Organization" tabs.
import { isFacebookMessage } from './fbFilter';

export interface Notification {
  id: string;
  targetUserId?: string;
  sourceDeviceName?: string;
  text?: string;
  isHandled?: boolean;
  handledAt?: unknown;
  handledBy?: string;
  handledByName?: string;
  createdAt?: unknown;
  timestamp?: unknown;
  postedAt?: number;
  /** Worker phone's device doc id, when the notification carries one. */
  deviceId?: string;
  sourceDeviceId?: string;
  /** Team phone number (#0003) of the phone that echoed it. */
  sourceDeviceNumber?: string;
  /** App the notification came from (Facebook, Messenger, …). */
  sourceApp?: string;
  sourcePackage?: string;
}

/**
 * Dashboard shows Facebook messages, Messenger chats and DMs only. Echoed notifications from other apps
 * (TikTok, Gmail, carrier…) or Facebook non-messages (friend requests, "waiting for you") are hidden.
 * Only notifications that came from a phone are shown. Old worker-app notifications carry no app info and are kept.
 */
export const isWanted = (n: Notification) =>
  // Phones only: website (webhook) leads, CRM reminders, digests and system alerts carry no phone and are left out.
  !!(n.sourceDeviceId || n.deviceId) &&
  ((!n.sourcePackage && !n.sourceApp) || isFacebookMessage(n.sourcePackage || '', n.sourceApp || '', '', n.text || ''));

export interface DeviceInfo { id: string; deviceNumber?: string; deviceName?: string; userId?: string }

/** Firestore Timestamp / Date / ms → ms (0 when unknown). */
export function toMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  const d = new Date(String(v)).getTime();
  return Number.isNaN(d) ? 0 : d;
}

export const when = (n: Notification) => toMs(n.createdAt) || toMs(n.timestamp) || n.postedAt || 0;
