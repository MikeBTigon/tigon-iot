import React, { useSyncExternalStore } from 'react';
import { formatDistanceToNow } from 'date-fns';

// One shared minute clock: only the small <TimeAgo> labels re-render each minute, not whole lists.
const subs = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

const subscribe = (cb: () => void) => {
  subs.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      subs.forEach((f) => f());
    }, 60_000);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
};
const getNow = () => now;

/** "5 minutes ago" for a time in ms (empty when unknown); refreshes every minute. */
const TimeAgo: React.FC<{ ms: number }> = ({ ms }) => {
  const current = useSyncExternalStore(subscribe, getNow, getNow);
  if (!ms) return null;
  return <>{formatDistanceToNow(Math.min(ms, current), { addSuffix: true })}</>;
};

export default TimeAgo;
