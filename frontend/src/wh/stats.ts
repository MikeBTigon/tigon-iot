/** Webhook Flows — dashboard counters from wh_stats/d_YYYYMMDD (America/New_York days). */
import { limit, orderBy } from 'firebase/firestore';
import { useWhCollection } from './data';
import { WH } from './types';
import type { WhDayStats } from './types';

export type StatsRow = WhDayStats & { id: string };

const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYYMMDD of the New York calendar day containing `ms`. */
export const nyDayKey = (ms: number) => NY.format(new Date(ms)).replace(/-/g, '');

/** The last `n` day keys ending today (oldest first). Calendar arithmetic, so DST never skips a day. */
export function lastDayKeys(n: number, now: number): string[] {
  const today = nyDayKey(now);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(4, 6));
  const d = Number(today.slice(6, 8));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10).replace(/-/g, ''));
  return out;
}

/** "0928" style label → "Sep 28". */
export const dayLabel = (key: string) =>
  new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))))
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Day key of a stats doc (from its id d_YYYYMMDD, falling back to its `day` field). */
export const statsKey = (r: StatsRow) => (r.id.startsWith('d_') ? r.id.slice(2) : String(r.day || '').replace(/-/g, ''));

/**
 * Live stats for the last `days` days. Single-field query: orderBy('day') desc + limit, so no composite index.
 * Returns undefined rows while loading.
 */
export function useWhStats(days: number) {
  return useWhCollection<StatsRow>(WH.stats, [orderBy('day', 'desc'), limit(days + 1)], [days]);
}

export interface StatsSummary {
  total: number;
  spam: number;
  duplicate: number;
  failedSteps: number;
  series: Array<{ key: string; label: string; count: number }>;
  byDomain: Record<string, number>;
  byWebhook: Record<string, number>;
  bySource: Record<string, number>;
}

const addMap = (into: Record<string, number>, from: Record<string, number> | undefined, keep?: (k: string) => boolean) => {
  for (const [k, v] of Object.entries(from || {})) if (!keep || keep(k)) into[k] = (into[k] || 0) + (Number(v) || 0);
};

/**
 * Sum stats over `keys` (day keys). `domainId` narrows totals/series to one website (spam/duplicate/failed
 * counts are only kept site-wide, so they are 0 then); `webhookIds` narrows byWebhook.
 */
export function summarize(rows: StatsRow[] | undefined, keys: string[], domainId?: string, webhookIds?: Set<string>): StatsSummary {
  const byKey = new Map((rows || []).map((r) => [statsKey(r), r]));
  const s: StatsSummary = { total: 0, spam: 0, duplicate: 0, failedSteps: 0, series: [], byDomain: {}, byWebhook: {}, bySource: {} };
  for (const k of keys) {
    const r = byKey.get(k);
    const count = r ? (domainId ? Number(r.byDomain?.[domainId] || 0) : Number(r.total || 0)) : 0;
    s.series.push({ key: k, label: dayLabel(k), count });
    if (!r) continue;
    s.total += count;
    if (!domainId) {
      s.spam += Number(r.spam || 0);
      s.duplicate += Number(r.duplicate || 0);
      s.failedSteps += Number(r.failedSteps || 0);
      addMap(s.bySource, r.bySource);
    }
    addMap(s.byDomain, r.byDomain, domainId ? (d) => d === domainId : undefined);
    addMap(s.byWebhook, r.byWebhook, webhookIds ? (w) => webhookIds.has(w) : undefined);
  }
  return s;
}

/** Top N entries of a count map, largest first. */
export const topEntries = (m: Record<string, number>, n = 8) =>
  Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);

/** Per-day series of any counter (e.g. one webhook: (r) => r.byWebhook?.[id]). */
export function seriesFor(rows: StatsRow[] | undefined, keys: string[], pick: (r: StatsRow) => number | undefined) {
  const byKey = new Map((rows || []).map((r) => [statsKey(r), r]));
  return keys.map((k) => {
    const r = byKey.get(k);
    return { key: k, label: dayLabel(k), count: r ? Number(pick(r) || 0) : 0 };
  });
}
