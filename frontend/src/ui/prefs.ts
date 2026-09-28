/**
 * User preferences stored on mp_users/{uid}.prefs (see growthTypes UserPrefs).
 * Rules allow a user to update their own doc as long as role/email don't change, so we only
 * ever touch `prefs.<field>` with a dotted-path update.
 */
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../mp/constants';
import type { UserPrefs } from '../mp/growthTypes';
import type { MpProfile } from '../mp/types';

/** Reads prefs from an MP profile (the field isn't on the MpProfile type, but it is on the doc). */
export const prefsOf = (profile: MpProfile | null | undefined): UserPrefs =>
  ((profile as (MpProfile & { prefs?: UserPrefs }) | null | undefined)?.prefs) || {};

/** Saves one pref on the user's MP profile. Queued offline by Firestore; errors are logged, not thrown. */
export async function saveUserPref<K extends keyof UserPrefs>(uid: string, key: K, value: NonNullable<UserPrefs[K]>) {
  try {
    await updateDoc(doc(db, COLLECTIONS.users, uid), { [`prefs.${key}`]: value });
  } catch (e) {
    console.warn(`Could not save preference ${key}`, e);
  }
}

/** localStorage wrappers that never throw (private mode, blocked storage). */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}
