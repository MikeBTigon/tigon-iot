// Team approval status of the signed-in person (mp_users/{uid}.status).
// New sign-ups start as 'pending' until an admin approves them (Admin page → Waiting for approval);
// offboarded people are 'disabled'. Profiles from before approvals existed have no status: they are active.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { COLLECTIONS } from '../mp/constants';

export type MemberStatus = 'active' | 'pending' | 'disabled';

/**
 * 'loading' — not known yet; 'signed-out' — nobody signed in; 'none' — no team profile yet (first visit:
 * MpShell shows the profile setup, which creates a 'pending' profile); otherwise the profile's status.
 */
export type MemberState = 'loading' | 'signed-out' | 'none' | MemberStatus;

/** Status of a profile doc (missing/unknown status = active, so existing people keep working). */
export const memberStatusOf = (p: { status?: unknown } | null | undefined): MemberStatus =>
  p?.status === 'pending' || p?.status === 'disabled' ? p.status : 'active';

/** True when the person must wait (pending) or has been turned off (disabled). */
export const isBlockedMember = (s: MemberState): s is 'pending' | 'disabled' => s === 'pending' || s === 'disabled';

/**
 * Live approval status of the signed-in person.
 * With `reloadOnApproval`, the page reloads when a pending person is approved, so every screen and
 * live list starts fresh with the new access (use it in the one always-mounted app guard).
 */
export function useMemberStatus(opts: { reloadOnApproval?: boolean } = {}): MemberState {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid || '';
  const reload = !!opts.reloadOnApproval;
  const [snap, setSnap] = useState<{ uid: string; state: MemberState } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let was: MemberState | null = null;
    return onSnapshot(
      doc(db, COLLECTIONS.users, uid),
      (s) => {
        const state: MemberState = s.exists() ? memberStatusOf(s.data()) : 'none';
        if (reload && was === 'pending' && state === 'active') window.location.reload();
        was = state;
        setSnap({ uid, state });
      },
      // Can't read the profile (e.g. email not verified yet): don't block here; the rules still apply.
      () => setSnap({ uid, state: 'none' }),
    );
  }, [uid, reload]);

  if (!uid) return 'signed-out';
  if (!snap || snap.uid !== uid) return 'loading';
  return snap.state;
}
