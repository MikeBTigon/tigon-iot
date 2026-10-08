// Track 2 (texting) — shared labels and helpers for the texting pages.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../config/firebase';
import { e164 } from '../salesData';
import type { CadenceStep, SmsDoc, SmsKind } from '../salesTypes';

export const KIND_LABEL: Record<SmsKind, string> = {
  manual: 'Sent by hand', auto_lead: 'Auto-text (new lead)', missed_call: 'Missed call', cadence: 'Follow-up',
  price_drop: 'Price drop', similar: 'Similar carts', appointment: 'Visit reminder', no_show: 'Missed visit',
  quote: 'Quote', prequal: 'Financing', trade_in: 'Trade-in', referral: 'Referral', service: 'After-sale', reply: 'Reply',
};

export const STATUS_LABEL: Record<SmsDoc['status'], string> = {
  queued: 'Waiting', sending: 'Sending', sent: 'Sent', failed: 'Failed', skipped: 'Not sent',
};
export const STATUS_COLOR: Record<SmsDoc['status'], 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  queued: 'default', sending: 'info', sent: 'success', failed: 'error', skipped: 'warning',
};

/** "(215) 555-0123". */
export function prettyPhone(raw: unknown): string {
  const e = e164(raw);
  return e ? `(${e.slice(2, 5)}) ${e.slice(5, 8)}-${e.slice(8)}` : String(raw || '');
}

export const when = (ts: number | undefined) => (ts ? new Date(ts).toLocaleString([], {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '');

export const sortSteps = (steps: CadenceStep[]) => [...(steps || [])].sort((a, b) => a.day - b.day);
export const CHANNEL_VERB: Record<CadenceStep['channel'], string> = { sms: 'text', call: 'call', email: 'email' };

/** The texting phone checks in every 30 seconds; 3 minutes without one = offline. */
export const TEXTING_PHONE_ONLINE_MS = 3 * 60_000;

export interface DeviceInfo { id: string; deviceName: string; deviceNumber?: string; userId: string; lastPingAt?: number; lastSeen?: number; status?: string; platform?: string }

/** One device doc, live (managers can read every phone). */
export function useDevice(id: string | undefined): DeviceInfo | null | undefined {
  const [state, setState] = useState<{ id: string; dev: DeviceInfo | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, 'devices', id),
      (s) => setState({ id, dev: s.exists() ? ({ id: s.id, ...s.data() } as DeviceInfo) : null }),
      () => setState({ id, dev: null }));
  }, [id]);
  if (!id) return null;
  return state && state.id === id ? state.dev : undefined;
}

export const lastCheckIn = (d: DeviceInfo | null | undefined) => Number(d?.lastPingAt || d?.lastSeen || 0);

export interface SmsAdminStatus { twilioKeys: boolean; provider: string; phones: Record<string, string>; defaultPhone: string }

export const smsAdmin = {
  status: async () => (await httpsCallable<{ action: string }, SmsAdminStatus>(functions, 'mpSmsAdmin')({ action: 'status' })).data,
  /** storeId '*' = the fallback phone; deviceId '' = none. */
  setPhone: async (storeId: string, deviceId: string) => {
    await httpsCallable(functions, 'mpSmsAdmin')({ action: 'setPhone', storeId, deviceId });
  },
};
