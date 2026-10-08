// Track 1 (speed to lead) — pure helpers: response timer, first-response fields.
import type { Lead } from '../../growthTypes';
import type { LeadSalesFields } from '../salesTypes';

export type SpeedLead = Lead & LeadSalesFields;

const MIN = 60_000;

/** "12 min", "3 h", "2 days". */
export function minutesLabel(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} days`;
}

/** A person answered the lead (call/text/email tap, a text they sent, or claimed it). */
export const isAnswered = (l: Partial<SpeedLead>) => !!(l.firstResponseAt || l.lastContactAt || l.claimedAt);

export type SpeedState =
  | { kind: 'waiting'; minutes: number; level: 'ok' | 'warn' | 'late'; label: string }
  | { kind: 'answered'; minutes: number; label: string };

/**
 * Where the response timer stands: waiting (new + nobody answered yet) or answered (with how long it took).
 * `marks` = alert minutes (amber at the first, red at the last).
 */
export function speedState(l: Partial<SpeedLead>, now: number, marks: number[] = [5, 15]): SpeedState | null {
  if (!l.createdAt) return null;
  const sorted = [...marks].filter((m) => m > 0).sort((a, b) => a - b);
  const first = sorted[0] ?? 5;
  const last = sorted[sorted.length - 1] ?? 15;
  if (l.firstResponseAt || typeof l.responseMinutes === 'number') {
    const minutes = typeof l.responseMinutes === 'number'
      ? l.responseMinutes : Math.max(0, Math.round(((l.firstResponseAt || l.createdAt) - l.createdAt) / MIN));
    return { kind: 'answered', minutes, label: `Answered in ${minutesLabel(minutes)}` };
  }
  if (l.status !== 'new' || isAnswered(l)) return null;
  const minutes = Math.max(0, (now - l.createdAt) / MIN);
  const level = minutes >= last ? 'late' : minutes >= first ? 'warn' : 'ok';
  return { kind: 'waiting', minutes, level, label: `Waiting ${minutesLabel(minutes)}` };
}

/** Fields to add when a person first answers a lead (empty when it was answered before). */
export function firstResponsePatch(l: Partial<SpeedLead>, now = Date.now()): Partial<LeadSalesFields> {
  const out: Partial<LeadSalesFields> = {};
  if (!l.firstResponseAt) {
    out.firstResponseAt = now;
    out.responseMinutes = Math.max(0, Math.round((now - (l.createdAt || now)) / MIN));
  }
  // Answering the customer also claims a lead that was handed to you.
  if (l.assignedAt && !l.claimedAt) out.claimedAt = now;
  return out;
}

/** The lead is waiting for its owner to claim it. */
export const needsClaim = (l: Partial<SpeedLead>) => !!l.assignedAt && !l.claimedAt && l.status === 'new' && !isAnswered(l);
