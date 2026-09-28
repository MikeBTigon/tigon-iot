// Badges and posting streaks — computed on the fly from a person's events, leads and carts (nothing stored).
import type { MpCart, MpEvent } from '../types';
import type { Lead } from '../growthTypes';
import { dayKey } from './periods';

/** Everything the badge rules look at. */
export interface BadgeStats {
  posts: number;
  leads: number;
  sales: number;
  shares: number;
  /** Consecutive days with ≥1 post, ending today (or yesterday if nothing posted yet today). */
  streak: number;
  bestStreak: number;
  /** Posted at least once before 9am local time. */
  earlyBird: boolean;
  /** Distinct store locations of carts this person posted. */
  locations: number;
  /** Listings this person created that have 3+ photos. */
  photoListings: number;
}

/** Badge icon keys (mapped to MUI icons by the page). */
export type BadgeIcon = 'post' | 'fire' | 'lead' | 'sale' | 'share' | 'sun' | 'store' | 'photo' | 'trophy';

export interface BadgeDef {
  id: string;
  label: string;
  /** How to earn it (shown on locked badges). */
  how: string;
  icon: BadgeIcon;
  color: string;
  earned: (s: BadgeStats) => boolean;
  /** Current value / target for a progress hint on locked badges. */
  progress?: (s: BadgeStats) => [number, number];
}

/** Badge definitions — add a row here to add a badge. */
export const BADGES: BadgeDef[] = [
  { id: 'first-post', label: 'First post', how: 'Mark your first cart as posted.', icon: 'post', color: '#0e4671', earned: (s) => s.posts >= 1, progress: (s) => [s.posts, 1] },
  { id: 'posts-10', label: '10 posts', how: 'Post 10 times.', icon: 'post', color: '#2e7d32', earned: (s) => s.posts >= 10, progress: (s) => [s.posts, 10] },
  { id: 'posts-50', label: '50 posts', how: 'Post 50 times.', icon: 'trophy', color: '#ed6c02', earned: (s) => s.posts >= 50, progress: (s) => [s.posts, 50] },
  { id: 'posts-100', label: '100 posts', how: 'Post 100 times.', icon: 'trophy', color: '#af1f31', earned: (s) => s.posts >= 100, progress: (s) => [s.posts, 100] },
  { id: 'streak-5', label: '5-day streak', how: 'Post at least once a day, 5 days in a row.', icon: 'fire', color: '#d84315', earned: (s) => s.bestStreak >= 5, progress: (s) => [s.bestStreak, 5] },
  { id: 'leads-10', label: '10 leads', how: 'Log 10 leads.', icon: 'lead', color: '#6a1b9a', earned: (s) => s.leads >= 10, progress: (s) => [s.leads, 10] },
  { id: 'first-sale', label: 'First sale', how: 'Mark one of your leads as sold.', icon: 'sale', color: '#1b5e20', earned: (s) => s.sales >= 1, progress: (s) => [s.sales, 1] },
  { id: 'sharer', label: 'Sharer', how: 'Share carts 10 times (links, QR, WhatsApp…).', icon: 'share', color: '#0277bd', earned: (s) => s.shares >= 10, progress: (s) => [s.shares, 10] },
  { id: 'early-bird', label: 'Early bird', how: 'Post a cart before 9am.', icon: 'sun', color: '#f9a825', earned: (s) => s.earlyBird },
  { id: 'every-store', label: 'Every store', how: 'Post carts from 5 or more store locations.', icon: 'store', color: '#00695c', earned: (s) => s.locations >= 5, progress: (s) => [s.locations, 5] },
  { id: 'photo-pro', label: 'Photo pro', how: 'Create a listing with 3 or more photos.', icon: 'photo', color: '#c2185b', earned: (s) => s.photoListings >= 1, progress: (s) => [s.photoListings, 1] },
];

/** Current and best run of consecutive posting days. */
export function streaks(postTimes: number[], now = Date.now()): { current: number; best: number } {
  const days = new Set(postTimes.map(dayKey));
  if (!days.size) return { current: 0, best: 0 };
  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T12:00:00`);
    prev.setDate(prev.getDate() + 1);
    run = dayKey(prev.getTime()) === sorted[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  // Walk back from today (a streak survives until the end of the day after the last post).
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, best: Math.max(best, current) };
}

/** Builds badge stats for one person from their own events and leads plus the loaded inventory. */
export function badgeStats(uid: string, userKeys: string[], events: MpEvent[], leads: Lead[], carts: MpCart[], now = Date.now()): BadgeStats {
  const mine = events.filter((e) => e.userId === uid);
  const posts = mine.filter((e) => e.type === 'post_marked');
  const { current, best } = streaks(posts.map((e) => e.ts), now);
  const cartLoc = new Map(carts.map((c) => [c.docId, c.locationId]));
  const locations = new Set<string>();
  for (const e of posts) {
    const loc = e.cartId && cartLoc.get(e.cartId);
    if (loc) locations.add(loc);
  }
  // Posted-on records survive even when the events were logged before analytics existed.
  for (const c of carts) {
    const byMe = userKeys.some((k) => c.postedBy[k]) || Object.values(c.postedAccounts).some((p) => userKeys.includes(p.by));
    if (byMe && c.locationId) locations.add(c.locationId);
  }
  const myLeads = leads.filter((l) => l.ownerUid === uid);
  return {
    posts: posts.length,
    leads: myLeads.length,
    sales: myLeads.filter((l) => l.status === 'sold').length,
    shares: mine.filter((e) => e.type === 'share').length,
    streak: current,
    bestStreak: best,
    earlyBird: posts.some((e) => new Date(e.ts).getHours() < 9),
    locations: locations.size,
    photoListings: carts.filter((c) => c.createdBy === uid && c.source !== 'dms-api' && c.photos.length >= 3).length,
  };
}
