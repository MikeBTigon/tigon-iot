import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { nativePlatform } from '../native/platform';

export const CHANGE_REQUESTS = 'change_requests';

export type RequestKind = 'bug' | 'feature' | 'other';
export type RequestStatus = 'new' | 'planned' | 'in_progress' | 'done' | 'declined';
export const REQUEST_STATUSES: RequestStatus[] = ['new', 'planned', 'in_progress', 'done', 'declined'];
export const isOpenRequest = (s: RequestStatus) => s !== 'done' && s !== 'declined';

export interface ChangeRequest {
  id: string;
  kind: RequestKind;
  title: string;
  details: string;
  where: string;
  status: RequestStatus;
  createdBy: string;
  createdByName: string;
  createdByEmail: string;
  platform: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface NewRequest {
  kind: RequestKind;
  title: string;
  details: string;
  where: string;
}

/** Everyone sees their own requests; admins see everyone's (the Firestore rules enforce the same). */
export function useChangeRequests(uid: string | undefined, isAdmin: boolean) {
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!uid) return;
    const col = collection(db, CHANGE_REQUESTS);
    const q = isAdmin ? query(col, orderBy('createdAt', 'desc')) : query(col, where('createdBy', '==', uid));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChangeRequest);
        // Newest first (own-requests query is unordered to avoid needing an index).
        list.sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now()));
        setItems(list);
        setLoading(false);
        setError('');
      },
      (e) => {
        setLoading(false);
        setError(e.message);
      },
    );
  }, [uid, isAdmin]);

  return { items, loading, error };
}

export async function submitChangeRequest(
  user: { uid: string; name: string; email: string },
  r: NewRequest,
) {
  await addDoc(collection(db, CHANGE_REQUESTS), {
    kind: r.kind,
    title: r.title.trim(),
    details: r.details.trim(),
    where: r.where.trim(),
    status: 'new',
    createdBy: user.uid,
    createdByName: user.name,
    createdByEmail: user.email,
    platform: nativePlatform(),
    createdAt: serverTimestamp(),
  });
}

export const setRequestStatus = (id: string, status: RequestStatus) =>
  updateDoc(doc(db, CHANGE_REQUESTS, id), { status, updatedAt: serverTimestamp() });

export const deleteChangeRequest = (id: string) => deleteDoc(doc(db, CHANGE_REQUESTS, id));
