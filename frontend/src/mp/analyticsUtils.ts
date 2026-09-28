// Pure helpers for the MP Analytics page (no React, no Firestore).
import { addDays, format, startOfDay, subDays } from 'date-fns';

import { ONLINE_WINDOW_MS } from './constants';
import type { DeviceDay, DeviceDoc, MpEvent, QueueItem } from './types';

export type RangeKey = 'today' | '7d' | '30d' | '90d';

export const RANGE_OPTIONS: Array<{ value: RangeKey; label: string; days: number }> = [
  { value: 'today', label: 'Today', days: 1 },
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
];

export function rangeDays(key: RangeKey): number {
  return RANGE_OPTIONS.find((r) => r.value === key)?.days ?? 7;
}

/** Local midnight at the start of the range (range includes today). */
export function rangeStart(key: RangeKey, now = Date.now()): number {
  return startOfDay(subDays(now, rangeDays(key) - 1)).getTime();
}

export function dateKey(ts: number): string {
  return format(ts, 'yyyy-MM-dd');
}

/** Every YYYY-MM-DD from start (inclusive) through today. */
export function dayKeys(start: number, now = Date.now()): string[] {
  const out: string[] = [];
  const end = dateKey(now);
  for (let d = startOfDay(start); ; d = addDays(d, 1)) {
    const k = dateKey(d.getTime());
    out.push(k);
    if (k >= end || out.length > 400) break;
  }
  return out;
}

export function isPhone(d: DeviceDoc): boolean {
  return d.source === 'tigon-iot-app';
}

export function isOnline(d: DeviceDoc, now = Date.now()): boolean {
  return !!d.lastSeen && now - d.lastSeen <= ONLINE_WINDOW_MS && d.status !== 'revoked';
}

export interface Stats {
  prepared: number;
  posted: number;
  failed: number;
  activeMinutes: number;
}

export const emptyStats = (): Stats => ({ prepared: 0, posted: 0, failed: 0, activeMinutes: 0 });

/**
 * Success rate = posted / (posted + failed), or null with no outcomes.
 */
export function successRate(s: Pick<Stats, 'posted' | 'failed'>): number | null {
  const total = s.posted + s.failed;
  return total ? s.posted / total : null;
}

export function formatPct(r: number | null): string {
  return r === null ? '—' : `${Math.round(r * 100)}%`;
}

export function formatHours(minutes: number): string {
  const h = minutes / 60;
  return h >= 10 ? h.toFixed(0) : h.toFixed(1);
}

/**
 * A single post outcome, from an event or a queue item. Queue items whose id already
 * appears on a post_marked / post_failed event are dropped so nothing counts twice.
 */
export interface Outcome {
  kind: 'posted' | 'failed';
  userId: string;
  deviceId: string;
  ts: number;
}

export function buildOutcomes(events: MpEvent[], queue: QueueItem[], start: number): Outcome[] {
  const out: Outcome[] = [];
  const seenQueue = new Set<string>();
  for (const e of events) {
    if (e.type !== 'post_marked' && e.type !== 'post_failed') continue;
    if (e.queueId) seenQueue.add(e.queueId);
    out.push({ kind: e.type === 'post_marked' ? 'posted' : 'failed', userId: e.userId, deviceId: e.deviceId, ts: e.ts });
  }
  for (const q of queue) {
    if (seenQueue.has(q.id)) continue;
    if (q.status === 'posted') {
      const ts = q.postedAt || q.updatedAt;
      if (ts >= start) out.push({ kind: 'posted', userId: q.assignedUserId, deviceId: q.deviceId, ts });
    } else if (q.status === 'failed') {
      if (q.updatedAt >= start) out.push({ kind: 'failed', userId: q.assignedUserId, deviceId: q.deviceId, ts: q.updatedAt });
    }
  }
  return out;
}

function bump(m: Map<string, Stats>, key: string): Stats {
  let s = m.get(key);
  if (!s) {
    s = emptyStats();
    m.set(key, s);
  }
  return s;
}

/** Aggregate stats keyed by the value `keyOf` returns (e.g. userId or deviceId). */
export function statsBy(
  events: MpEvent[],
  outcomes: Outcome[],
  days: DeviceDay[],
  keyOf: (x: { userId: string; deviceId: string }) => string,
): Map<string, Stats> {
  const m = new Map<string, Stats>();
  for (const e of events) if (e.type === 'listing_prepared') bump(m, keyOf(e)).prepared += 1;
  for (const o of outcomes) bump(m, keyOf(o))[o.kind] += 1;
  for (const d of days) bump(m, keyOf(d)).activeMinutes += d.activeMinutes || 0;
  return m;
}

export function totals(events: MpEvent[], outcomes: Outcome[], days: DeviceDay[]): Stats {
  return statsBy(events, outcomes, days, () => 'all').get('all') ?? emptyStats();
}

export interface DayPoint {
  date: string;
  label: string;
  prepared: number;
  posted: number;
  failed: number;
  activeMinutes: number;
}

export function dailySeries(events: MpEvent[], outcomes: Outcome[], days: DeviceDay[], start: number): DayPoint[] {
  const pts = new Map<string, DayPoint>();
  for (const k of dayKeys(start)) {
    const [y, mo, d] = k.split('-').map(Number);
    pts.set(k, { date: k, label: format(new Date(y, mo - 1, d), 'MMM d'), prepared: 0, posted: 0, failed: 0, activeMinutes: 0 });
  }
  for (const e of events) {
    if (e.type !== 'listing_prepared') continue;
    const p = pts.get(dateKey(e.ts));
    if (p) p.prepared += 1;
  }
  for (const o of outcomes) {
    const p = pts.get(dateKey(o.ts));
    if (p) p[o.kind] += 1;
  }
  for (const d of days) {
    const p = pts.get(d.date);
    if (p) p.activeMinutes += d.activeMinutes || 0;
  }
  return [...pts.values()];
}

/** Latest error / post_failed message per device id. */
export function lastErrorByDevice(events: MpEvent[]): Map<string, MpEvent> {
  const m = new Map<string, MpEvent>();
  for (const e of events) {
    if (e.type !== 'error' && e.type !== 'post_failed') continue;
    const prev = m.get(e.deviceId);
    if (!prev || e.ts > prev.ts) m.set(e.deviceId, e);
  }
  return m;
}

export function recentFailures(events: MpEvent[], n = 20): MpEvent[] {
  return events
    .filter((e) => e.type === 'error' || e.type === 'post_failed')
    .sort((a, b) => b.ts - a.ts)
    .slice(0, n);
}

export function isPermissionError(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code || '';
  return code === 'permission-denied' || /permission/i.test(String((e as Error | null)?.message || ''));
}
