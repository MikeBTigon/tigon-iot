// Team settings (mp_settings/general): approval workflow, default phone, logo, relist days.
import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../constants';
import type { MpSettings } from '../growthTypes';

export const DEFAULT_SETTINGS: MpSettings = { requireApproval: false, defaultPhone: '', logoUrl: '', relistAfterDays: 7 };

export const settingsRef = () => doc(db, COLLECTIONS.settings, 'general');

const withDefaults = (data: Partial<MpSettings> | undefined): MpSettings => ({ ...DEFAULT_SETTINGS, ...(data || {}) });

/** One-off read (defaults when the doc is missing or unreadable). */
export async function loadMpSettings(): Promise<MpSettings> {
  try {
    const snap = await getDoc(settingsRef());
    return withDefaults(snap.data() as Partial<MpSettings> | undefined);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Live settings; `exists` is false until an admin saves them once. */
export function useMpSettings(): { settings: MpSettings; exists: boolean; loaded: boolean } {
  const [state, setState] = useState({ settings: DEFAULT_SETTINGS, exists: false, loaded: false });
  useEffect(
    () =>
      onSnapshot(
        settingsRef(),
        (snap) => setState({ settings: withDefaults(snap.data() as Partial<MpSettings> | undefined), exists: snap.exists(), loaded: true }),
        () => setState({ settings: DEFAULT_SETTINGS, exists: false, loaded: true }),
      ),
    [],
  );
  return state;
}

/** True when this person's queue items need a manager's OK first. */
export const needsApproval = (role: string | undefined, settings: MpSettings) => settings.requireApproval && role === 'sales';
