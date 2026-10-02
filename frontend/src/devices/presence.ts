// Phone online time (Users page). mp_device_online/{deviceId}_{YYYYMMDD}: one key per 5-minute slot (New York day)
// in which the phone checked in. KEEP IN SYNC with functions/src/presence.ts.
import { collection, documentId, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { readAll } from '../mp/firestorePaging';

export const ONLINE = 'mp_device_online';
export const SLOT_MIN = 5;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MIN;
export const SLOTS_PER_HOUR = 60 / SLOT_MIN;
const TZ = 'America/New_York';

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** New York calendar day (YYYY-MM-DD and YYYYMMDD) and 5-minute slot of a moment. */
export function nySlot(ms: number): { day: string; date: string; slot: number } {
  const p: Record<string, string> = {};
  for (const x of parts.formatToParts(new Date(ms))) p[x.type] = x.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  const slot = Math.floor((Number(p.hour) * 60 + Number(p.minute)) / SLOT_MIN);
  return { day: date.replace(/-/g, ''), date, slot: Math.min(SLOTS_PER_DAY - 1, slot) };
}

export const hoursOf = (slots: Record<string, unknown> | undefined) => (Object.keys(slots || {}).length * SLOT_MIN) / 60;

export const todayNy = () => nySlot(Date.now()).date;
export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export function dateRange(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });

export interface Periods { today: string; yesterday: string; week: string[]; month: string[]; year: string[]; last7: string[]; last30: string[] }
export function periods(t = todayNy()): Periods {
  const wd = weekday(t);
  return {
    today: t,
    yesterday: addDays(t, -1),
    week: dateRange(addDays(t, -((wd + 6) % 7)), t),
    month: dateRange(`${t.slice(0, 8)}01`, t),
    year: dateRange(`${t.slice(0, 5)}01-01`, t),
    last7: dateRange(addDays(t, -6), t),
    last30: dateRange(addDays(t, -29), t),
  };
}

/** deviceId → date → slots */
export type OnlineMap = Map<string, Map<string, Record<string, unknown>>>;

/** All online days since `from` (every phone), or one person's (any date; filtered here). */
export async function loadOnline(from: string, userId?: string): Promise<OnlineMap> {
  const q = userId
    ? query(collection(db, ONLINE), where('userId', '==', userId), orderBy(documentId()))
    : query(collection(db, ONLINE), where('date', '>=', from), orderBy('date'));
  const docs = await readAll(q);
  const out: OnlineMap = new Map();
  for (const d of docs) {
    const date = String(d.get('date') || '');
    if (date < from) continue;
    const dev = String(d.get('deviceId') || '');
    if (!out.has(dev)) out.set(dev, new Map());
    out.get(dev)!.set(date, (d.get('slots') || {}) as Record<string, unknown>);
  }
  return out;
}

export const hoursOn = (m: OnlineMap, deviceId: string, date: string) => hoursOf(m.get(deviceId)?.get(date));
export const hoursOver = (m: OnlineMap, deviceId: string, dates: string[]) => dates.reduce((s, d) => s + hoursOn(m, deviceId, d), 0);
export const fmtHours = (h: number) => (h >= 100 ? h.toFixed(0) : h >= 10 ? h.toFixed(1).replace(/\.0$/, '') : h.toFixed(1));

export interface PresenceSettings { minHours: number; days: number[]; reportTo: string }
export const DEFAULT_PRESENCE: PresenceSettings = { minHours: 8, days: [0, 1, 2, 3, 4, 5, 6], reportTo: 'iot@tigongolfcarts.com' };
