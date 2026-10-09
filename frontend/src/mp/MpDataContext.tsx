import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  writeBatch,
  type Query,
  type QuerySnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { COLLECTIONS, FETCH_BATCH, SEED_ACCOUNTS } from './constants';
import { cartFromDoc } from './cartUtils';
import type { MpAccount, MpCart, MpCartDoc, MpProfile, MpRole, MpSyncStatus } from './types';

const BROKEN_KEY = 'mp.brokenPhotos';

interface MpData {
  /** undefined = loading, null = no MP profile yet. */
  profile: MpProfile | null | undefined;
  isAdmin: boolean;
  /** Keys this user's posted state is stored under (uid + claimed legacy id). */
  userKeys: string[];
  users: MpProfile[];
  userName: (key: string) => string;
  accounts: MpAccount[];
  carts: MpCart[];
  cartsLoading: boolean;
  cartsError: string;
  brokenPhotos: Set<string>;
  reportBrokenPhoto: (url: string) => void;
  ensureCartsLoaded: () => void;
  reloadCarts: () => void;
  refreshCart: (docId: string) => Promise<void>;
  setPosted: (cart: MpCart, posted: boolean) => Promise<void>;
  setPostedAccounts: (cart: MpCart, add: string[], remove: string[]) => Promise<void>;
  /** "Do not post": keeps the cart out of Suggested to post (anyone on the team can set or clear it). */
  setDoNotPost: (cart: MpCart, on: boolean) => Promise<void>;
  deleteCarts: (docIds: string[]) => Promise<void>;
  saveProfile: (data: { name: string; legacyId?: string; role?: MpRole }) => Promise<void>;
  setUserRole: (uid: string, role: MpRole) => Promise<void>;
  saveAccount: (account: Omit<MpAccount, 'id'> & { id?: string }) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  seedAccounts: () => Promise<void>;
  syncStatus: MpSyncStatus | null;
  /** Pulls active inventory from the DMS API now (admins). */
  syncNow: () => Promise<MpSyncStatus>;
}

const MpContext = createContext<MpData | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider, like useAuth
export const useMp = () => {
  const ctx = useContext(MpContext);
  if (!ctx) throw new Error('useMp must be used within MpDataProvider');
  return ctx;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function loadBroken(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(BROKEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export const MpDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || '';
  const [profile, setProfile] = useState<MpProfile | null | undefined>(undefined);
  const [users, setUsers] = useState<MpProfile[]>([]);
  const [accounts, setAccounts] = useState<MpAccount[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [cartMap, setCartMap] = useState<Map<string, MpCart>>(new Map());
  const [cartsLoading, setCartsLoading] = useState(false);
  const [cartsError, setCartsError] = useState('');
  const [syncStatus, setSyncStatus] = useState<MpSyncStatus | null>(null);
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(loadBroken);
  const loadRun = useRef(0);
  const loadStarted = useRef(false);
  const seeding = useRef(false);

  // Profile + team
  useEffect(() => {
    if (!uid) {
      setProfile(undefined);
      return;
    }
    const unsubProfile = onSnapshot(
      doc(db, COLLECTIONS.users, uid),
      (snap) => setProfile(snap.exists() ? ({ uid, ...snap.data() } as MpProfile) : null),
      () => setProfile(null),
    );
    const unsubUsers = onSnapshot(
      collection(db, COLLECTIONS.users),
      (snap) => setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as MpProfile)),
      () => setUsers([]),
    );
    return () => {
      unsubProfile();
      unsubUsers();
    };
  }, [uid]);

  const isMember = !!profile;
  const isAdmin = profile?.role === 'admin';

  // Accounts (live)
  useEffect(() => {
    if (!isMember) return;
    return onSnapshot(
      collection(db, COLLECTIONS.accounts),
      (snap) => {
        setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MpAccount));
        setAccountsLoaded(true);
      },
      () => setAccountsLoaded(true),
    );
  }, [isMember]);

  // DMS sync status (live)
  useEffect(() => {
    if (!isMember) return;
    return onSnapshot(
      doc(db, 'mp_meta', 'sync'),
      (snap) => setSyncStatus(snap.exists() ? (snap.data() as MpSyncStatus) : null),
      () => setSyncStatus(null),
    );
  }, [isMember]);

  const seedAccounts = useCallback(async () => {
    const batch = writeBatch(db);
    let order = 0;
    for (const [group, names] of Object.entries(SEED_ACCOUNTS)) {
      for (const name of names) {
        batch.set(doc(db, COLLECTIONS.accounts, `acct_${slug(name)}`), { name, group, owner: '', order: order++ }, { merge: true });
      }
    }
    await batch.commit();
  }, []);

  // Auto-seed accounts on first load when the collection is empty.
  useEffect(() => {
    if (isAdmin && accountsLoaded && accounts.length === 0 && !seeding.current) {
      seeding.current = true;
      seedAccounts().catch((e) => console.error('Account seed failed', e));
    }
  }, [isAdmin, accountsLoaded, accounts.length, seedAccounts]);

  // Carts: loaded progressively in batches, kept for the session.
  const loadCarts = useCallback(async () => {
    const run = ++loadRun.current;
    setCartsLoading(true);
    setCartsError('');
    setCartMap(new Map());
    let cursor: QueryDocumentSnapshot | null = null;
    try {
      for (;;) {
        const q: Query = cursor
          ? query(collection(db, COLLECTIONS.carts), orderBy(documentId()), startAfter(cursor), limit(FETCH_BATCH))
          : query(collection(db, COLLECTIONS.carts), orderBy(documentId()), limit(FETCH_BATCH));
        const snap: QuerySnapshot = await getDocs(q);
        if (run !== loadRun.current) return;
        setCartMap((prev) => {
          const next = new Map(prev);
          for (const d of snap.docs) {
            const c = cartFromDoc(d.id, d.data() as MpCartDoc);
            if (c.inStock && !c.soldLocally) next.set(d.id, c);
          }
          return next;
        });
        if (snap.docs.length < FETCH_BATCH) break;
        cursor = snap.docs[snap.docs.length - 1];
      }
    } catch (e) {
      console.error('Loading carts failed', e);
      if (run === loadRun.current) setCartsError('Could not load inventory. Check your MP Assistant access.');
    } finally {
      if (run === loadRun.current) setCartsLoading(false);
    }
  }, []);

  const ensureCartsLoaded = useCallback(() => {
    if (loadStarted.current || !isMember) return;
    loadStarted.current = true;
    loadCarts();
  }, [isMember, loadCarts]);

  useEffect(() => {
    if (!uid) {
      loadStarted.current = false;
      loadRun.current++;
      setCartMap(new Map());
    }
  }, [uid]);

  const refreshCart = useCallback(async (docId: string) => {
    const snap = await getDoc(doc(db, COLLECTIONS.carts, docId));
    setCartMap((prev) => {
      const next = new Map(prev);
      const c = snap.exists() ? cartFromDoc(docId, snap.data() as MpCartDoc) : null;
      if (c?.inStock && !c.soldLocally) next.set(docId, c);
      else next.delete(docId);
      return next;
    });
  }, []);

  const patchLocal = (docId: string, fn: (c: MpCart) => MpCart) =>
    setCartMap((prev) => {
      const c = prev.get(docId);
      if (!c) return prev;
      const next = new Map(prev);
      next.set(docId, fn(c));
      return next;
    });

  // Re-fetch shortly after a write so changes made on other devices come through too.
  const syncSoon = (docId: string) => setTimeout(() => refreshCart(docId).catch(() => undefined), 800);

  const setPosted = useCallback(
    async (cart: MpCart, posted: boolean) => {
      if (!profile) return;
      const keys = [uid, profile.legacyId].filter(Boolean) as string[];
      const ts = Date.now();
      const update: Record<string, unknown> = {};
      if (posted) update[`postedBy.${uid}`] = ts;
      else for (const k of keys) update[`postedBy.${k}`] = deleteField();
      patchLocal(cart.docId, (c) => {
        const postedBy = { ...c.postedBy };
        if (posted) postedBy[uid] = ts;
        else for (const k of keys) delete postedBy[k];
        return { ...c, postedBy };
      });
      await updateDoc(doc(db, COLLECTIONS.carts, cart.docId), update);
      syncSoon(cart.docId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, uid],
  );

  const setPostedAccounts = useCallback(
    async (cart: MpCart, add: string[], remove: string[]) => {
      if (!profile) return;
      const ts = Date.now();
      const update: Record<string, unknown> = {};
      for (const id of add) update[`postedAccounts.${id}`] = { by: uid, ts };
      for (const id of remove) update[`postedAccounts.${id}`] = deleteField();
      // Checking any account auto-marks the cart as posted for the current user.
      if (add.length) update[`postedBy.${uid}`] = cart.postedBy[uid] || ts;
      patchLocal(cart.docId, (c) => {
        const postedAccounts = { ...c.postedAccounts };
        for (const id of add) postedAccounts[id] = { by: uid, ts };
        for (const id of remove) delete postedAccounts[id];
        const postedBy = add.length ? { ...c.postedBy, [uid]: c.postedBy[uid] || ts } : c.postedBy;
        return { ...c, postedAccounts, postedBy };
      });
      await updateDoc(doc(db, COLLECTIONS.carts, cart.docId), update);
      syncSoon(cart.docId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, uid],
  );

  const setDoNotPost = useCallback(
    async (cart: MpCart, on: boolean) => {
      if (!profile) return;
      const value = on ? { by: uid, at: Date.now() } : undefined;
      patchLocal(cart.docId, (c) => ({ ...c, doNotPost: value }));
      await updateDoc(doc(db, COLLECTIONS.carts, cart.docId), { doNotPost: value || deleteField() });
      syncSoon(cart.docId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, uid],
  );

  const deleteCarts = useCallback(async (docIds: string[]) => {
    for (let i = 0; i < docIds.length; i += 400) {
      const batch = writeBatch(db);
      for (const id of docIds.slice(i, i + 400)) batch.delete(doc(db, COLLECTIONS.carts, id));
      await batch.commit();
    }
    setCartMap((prev) => {
      const next = new Map(prev);
      for (const id of docIds) next.delete(id);
      return next;
    });
  }, []);

  const saveProfile = useCallback(
    async (data: { name: string; legacyId?: string; role?: MpRole }) => {
      if (!currentUser) return;
      const ref = doc(db, COLLECTIONS.users, currentUser.uid);
      if (profile) {
        await updateDoc(ref, { name: data.name, legacyId: data.legacyId || '' });
      } else {
        await setDoc(ref, {
          email: currentUser.email,
          name: data.name,
          legacyId: data.legacyId || '',
          role: data.role || 'sales',
          createdAt: Date.now(),
        });
      }
    },
    [currentUser, profile],
  );

  const setUserRole = useCallback(async (targetUid: string, role: MpRole) => {
    await updateDoc(doc(db, COLLECTIONS.users, targetUid), { role });
  }, []);

  const saveAccount = useCallback(
    async (account: Omit<MpAccount, 'id'> & { id?: string }) => {
      const { id, ...data } = account;
      const ref = id ? doc(db, COLLECTIONS.accounts, id) : doc(collection(db, COLLECTIONS.accounts));
      await setDoc(ref, { ...data, order: data.order ?? accounts.length }, { merge: true });
    },
    [accounts.length],
  );

  const deleteAccount = useCallback(async (id: string) => {
    await deleteDoc(doc(db, COLLECTIONS.accounts, id));
  }, []);

  const syncNow = useCallback(async () => {
    const res = await httpsCallable<unknown, MpSyncStatus>(functions, 'mpSyncNow', { timeout: 540_000 })();
    loadCarts();
    return res.data;
  }, [loadCarts]);

  const reportBrokenPhoto = useCallback((url: string) => {
    setBrokenPhotos((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      try {
        sessionStorage.setItem(BROKEN_KEY, JSON.stringify([...next]));
      } catch {
        // storage unavailable — keep in memory only
      }
      return next;
    });
  }, []);

  const userName = useCallback(
    (key: string) => {
      const u = users.find((x) => x.uid === key) || users.find((x) => x.legacyId === key);
      if (u) return u.name || u.email;
      return key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Unknown';
    },
    [users],
  );

  const carts = useMemo(() => [...cartMap.values()], [cartMap]);
  const sortedAccounts = useMemo(
    () => accounts.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)),
    [accounts],
  );
  const userKeys = useMemo(() => [uid, profile?.legacyId].filter(Boolean) as string[], [uid, profile?.legacyId]);

  const value: MpData = {
    profile,
    isAdmin,
    userKeys,
    users,
    userName,
    accounts: sortedAccounts,
    carts,
    cartsLoading,
    cartsError,
    brokenPhotos,
    reportBrokenPhoto,
    ensureCartsLoaded,
    reloadCarts: loadCarts,
    refreshCart,
    setPosted,
    setPostedAccounts,
    setDoNotPost,
    deleteCarts,
    saveProfile,
    setUserRole,
    saveAccount,
    deleteAccount,
    seedAccounts,
    syncStatus,
    syncNow,
  };

  return <MpContext.Provider value={value}>{children}</MpContext.Provider>;
};
