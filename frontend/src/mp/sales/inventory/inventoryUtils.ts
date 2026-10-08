// Track 4 (inventory) — client helpers: days on lot, aged flags, suggested price, stale (repost) listings.
// Mirrors functions/src/sales/inventory.ts.
import type { MpCart } from '../../types';
import type { SalesSettings } from '../salesTypes';

export const DAY_MS = 86_400_000;

/** Whole days since the cart came into stock (0 when unknown). */
export const daysOnLot = (cart: Pick<MpCart, 'stockedAt' | 'savedAt'>, now = Date.now()) => {
  const at = cart.stockedAt || 0;
  return at > 0 ? Math.max(0, Math.floor((now - at) / DAY_MS)) : 0;
};

export type AgedLevel = 'urgent' | 'aged' | null;

export function agedLevel(days: number, a: SalesSettings['aged']): AgedLevel {
  if (a.urgentDays > 0 && days >= a.urgentDays) return 'urgent';
  if (a.flagDays > 0 && days >= a.flagDays) return 'aged';
  return null;
}

/** Price after the suggested cut, rounded to the nearest $50. */
export const suggestedPrice = (price: number, cutPct: number) =>
  price > 0 ? Math.max(50, Math.round((price * (1 - (Number(cutPct) || 0) / 100)) / 50) * 50) : 0;

/** Facebook accounts where this cart was posted more than `relistDays` ago (optionally only by `uid`). */
export function staleAccounts(cart: MpCart, relistDays: number, now = Date.now(), uid?: string): string[] {
  const cutoff = now - relistDays * DAY_MS;
  return Object.entries(cart.postedAccounts || {})
    .filter(([, e]) => e && e.ts > 0 && e.ts < cutoff && (!uid || e.by === uid))
    .map(([id]) => id);
}

/** Price drops in the price history, newest first. */
export function priceDrops(cart: MpCart): Array<{ from: number; to: number; at: number }> {
  const h = cart.priceHistory || [];
  const out: Array<{ from: number; to: number; at: number }> = [];
  for (let i = 1; i < h.length; i++) if (h[i].price < h[i - 1].price) out.push({ from: h[i - 1].price, to: h[i].price, at: h[i].at });
  return out.reverse();
}

export const agedLabel = (days: number) => `Aged ${days} day${days === 1 ? '' : 's'}`;
