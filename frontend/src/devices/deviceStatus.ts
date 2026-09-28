import { formatDistanceToNow } from 'date-fns';
import { ONLINE_WINDOW_MS } from '../mp/constants';

type Stamp = number | { toDate: () => Date } | null | undefined;

/** Epoch ms from a number or Firestore Timestamp. */
export function stampMs(v: Stamp): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  try {
    return v.toDate().getTime();
  } catch {
    return 0;
  }
}

/** Phone-app devices report `lastSeen`; worker phones report `lastActive`. */
export function lastSeenMs(d: { lastSeen?: Stamp; lastActive?: Stamp }): number {
  return Math.max(stampMs(d.lastSeen), stampMs(d.lastActive));
}

export function isOnline(d: { lastSeen?: Stamp; lastActive?: Stamp }): boolean {
  const t = lastSeenMs(d);
  return !!t && Date.now() - t < ONLINE_WINDOW_MS;
}

export function seenLabel(d: { lastSeen?: Stamp; lastActive?: Stamp }): string {
  const t = lastSeenMs(d);
  if (!t) return 'Never';
  return isOnline(d) ? 'Online now' : `Seen ${formatDistanceToNow(t, { addSuffix: true })}`;
}
