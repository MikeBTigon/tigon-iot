// Goal periods: ISO weeks ("2026-W40") and calendar months ("2026-09"), in local time.
import {
  addMonths, addWeeks, endOfISOWeek, endOfMonth, format, getISOWeek, getISOWeekYear, setISOWeek, startOfISOWeek,
  startOfMonth,
} from 'date-fns';
import type { Goal } from '../growthTypes';

export type Period = Goal['period'];

/** Period key containing `ts` (ISO week or month). */
export function periodKey(period: Period, ts: number): string {
  const d = new Date(ts);
  if (period === 'month') return format(d, 'yyyy-MM');
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
}

/** Start of the period for a key (a Date within it). */
function anchor(period: Period, key: string): Date {
  if (period === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1);
  }
  const [y, w] = key.split('-W').map(Number);
  // Jan 4th is always in ISO week 1 of its ISO year.
  return startOfISOWeek(setISOWeek(new Date(y, 0, 4), w || 1));
}

/** [start, end] epoch ms (inclusive) of a period key. */
export function periodRange(period: Period, key: string): { start: number; end: number } {
  const a = anchor(period, key);
  return period === 'month'
    ? { start: startOfMonth(a).getTime(), end: endOfMonth(a).getTime() }
    : { start: startOfISOWeek(a).getTime(), end: endOfISOWeek(a).getTime() };
}

/** Key of the period `offset` periods away (-1 = previous). */
export function shiftKey(period: Period, key: string, offset: number): string {
  const a = anchor(period, key);
  return periodKey(period, (period === 'month' ? addMonths(a, offset) : addWeeks(a, offset)).getTime());
}

/** "Week of Sep 28" / "September 2026". */
export function periodLabel(period: Period, key: string): string {
  const a = anchor(period, key);
  return period === 'month' ? format(a, 'MMMM yyyy') : `Week of ${format(a, 'MMM d')}`;
}

/** mp_goals document id. */
export const goalId = (userId: string, key: string) => `${userId}_${key}`;

/** Local YYYY-MM-DD for a timestamp. */
export const dayKey = (ts: number) => format(new Date(ts), 'yyyy-MM-dd');
