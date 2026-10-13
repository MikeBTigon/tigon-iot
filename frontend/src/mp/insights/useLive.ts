// Insights — live Firestore query hook (keyed, so a changed query resets cleanly without setState in effects).
import { useEffect, useState } from 'react';
import { onSnapshot, type Query } from 'firebase/firestore';

export type Row = Record<string, unknown> & { id: string };

/**
 * Live rows for a query. `key` must change whenever the query changes; pass `q = null` to skip.
 * Returns {rows, loaded, error} for the current key only.
 */
export function useLive<T extends Row = Row>(key: string, q: Query | null): { rows: T[]; loaded: boolean; error: string } {
  const [state, setState] = useState<{ key: string; rows: T[]; error: string }>({ key: '', rows: [], error: '' });
  useEffect(() => {
    if (!q) return;
    return onSnapshot(
      q,
      (s) => setState({ key, rows: s.docs.map((d) => ({ id: d.id, ...d.data() }) as T), error: '' }),
      (e) => setState({ key, rows: [], error: e.message }),
    );
    // The query object is rebuilt each render; `key` identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!q) return { rows: [], loaded: true, error: '' };
  return state.key === key ? { rows: state.rows, loaded: true, error: state.error } : { rows: [], loaded: false, error: '' };
}

/** Re-renders every `ms` milliseconds (live timers). */
export function useTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
