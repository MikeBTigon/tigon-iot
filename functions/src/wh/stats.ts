// Webhook Flows — daily counters: wh_stats/d_YYYYMMDD (America/New_York day).
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {WH} from './types';

export const TZ = 'America/New_York';

const dayFmt = new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'});

/** 'YYYYMMDD' for the New York calendar day of `ms`. */
export function nyDay(ms: number): string {
  return dayFmt.format(new Date(ms)).replace(/-/g, '');
}

/** [start, end) in ms of a New York day key. */
export function nyDayBounds(day: string): [number, number] {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(4, 6)) - 1;
  const d = Number(day.slice(6, 8));
  const startOf = (yy: number, mm: number, dd: number) => {
    const key = nyDay(Date.UTC(yy, mm, dd, 12));
    for (let h = 0; h <= 12; h++) {
      const t = Date.UTC(yy, mm, dd, h);
      if (nyDay(t) === key && nyDay(t - 1) !== key) return t;
    }
    return Date.UTC(yy, mm, dd, 5);
  };
  return [startOf(y, m, d), startOf(y, m, d + 1)];
}

/** Safe map key for a traffic source. */
export const sourceKey = (s?: string) =>
  (String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)) || 'direct';

export interface StatBump {
  total?: number;
  spam?: number;
  duplicate?: number;
  failedSteps?: number;
  domainId?: string;
  webhookId?: string;
  source?: string;
  /** Amount added to the byDomain/byWebhook/bySource entries (default 1; -1 when a lead is deleted). */
  mapDelta?: number;
}

/** Increment today's counters. Never throws (stats must not break ingestion). */
export async function bumpStats(b: StatBump, at = Date.now()) {
  const inc = admin.firestore.FieldValue.increment;
  const day = nyDay(at);
  const data: Record<string, unknown> = {day, updatedAt: Date.now()};
  for (const k of ['total', 'spam', 'duplicate', 'failedSteps'] as const) if (b[k]) data[k] = inc(b[k] as number);
  const m = b.mapDelta ?? 1;
  if (b.domainId) data.byDomain = {[b.domainId]: inc(m)};
  if (b.webhookId) data.byWebhook = {[b.webhookId]: inc(m)};
  if (b.source !== undefined) data.bySource = {[sourceKey(b.source)]: inc(m)};
  try {
    await admin.firestore().collection(WH.stats).doc('d_' + day).set(data, {merge: true});
  } catch (e) {
    logger.warn('wh stats update failed', e);
  }
}
