// One live `devices` listener shared by every screen that needs the phone list (Dashboard tabs, Users…),
// instead of each screen opening its own. The listener stays open 30 s after the last screen leaves, so
// moving between pages doesn't re-read the whole collection.
import { useCallback, useSyncExternalStore } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { DeviceDoc } from '../mp/types';

export interface DevicesState {
  /** undefined while loading. */
  rows: DeviceDoc[] | undefined;
  error: string;
}

interface Store {
  state: DevicesState;
  subs: Set<() => void>;
  unsub?: () => void;
  stopTimer?: ReturnType<typeof setTimeout>;
}

const LINGER_MS = 30_000;
const LOADING: DevicesState = { rows: undefined, error: '' };
const stores = new Map<string, Store>();

function storeFor(key: string): Store {
  let s = stores.get(key);
  if (!s) {
    s = { state: LOADING, subs: new Set() };
    stores.set(key, s);
  }
  return s;
}

function start(key: string, s: Store) {
  if (s.unsub) return;
  const ref = key === 'all' ? collection(db, 'devices') : query(collection(db, 'devices'), where('userId', '==', key.slice(5)));
  const emit = (state: DevicesState) => {
    s.state = state;
    s.subs.forEach((f) => f());
  };
  s.unsub = onSnapshot(
    ref,
    (snap) => emit({ rows: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DeviceDoc), error: '' }),
    (e) => {
      emit({ rows: [], error: e.message });
      // Let a later screen try again (e.g. after the role changes).
      s.unsub?.();
      s.unsub = undefined;
    },
  );
}

/**
 * Live phone list: `'all'` (managers: every device), a uid (that person's devices), or null (nothing yet).
 */
export function useSharedDevices(scope: 'all' | string | null | undefined): DevicesState {
  const key = scope ? (scope === 'all' ? 'all' : `user:${scope}`) : '';
  const subscribe = useCallback((cb: () => void) => {
    if (!key) return () => undefined;
    const s = storeFor(key);
    if (s.stopTimer) {
      clearTimeout(s.stopTimer);
      s.stopTimer = undefined;
    }
    s.subs.add(cb);
    start(key, s);
    return () => {
      s.subs.delete(cb);
      if (s.subs.size === 0) {
        s.stopTimer = setTimeout(() => {
          s.unsub?.();
          s.unsub = undefined;
          s.state = LOADING;
          s.stopTimer = undefined;
        }, LINGER_MS);
      }
    };
  }, [key]);
  const get = useCallback(() => (key ? storeFor(key).state : LOADING), [key]);
  return useSyncExternalStore(subscribe, get, get);
}
