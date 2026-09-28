import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { useMp } from '../../mp/MpDataContext';
import { postedTs } from '../../mp/cartUtils';
import type { DeviceDoc } from '../../mp/types';

export interface SetupProgress {
  profile: boolean;
  phone: boolean;
  alerts: boolean;
  listing: boolean;
  /** Steps done out of 4. */
  done: number;
  /** Number of the user's paired app phones / phones with alerts on. */
  phones: number;
  alertPhones: number;
}

/**
 * Which setup-guide steps the signed-in user has already done, from real data:
 * MP profile, a paired app phone, a phone with alerts on, and a listing created or posted.
 * `enabled: false` skips the devices listener (e.g. when onboarding is already finished).
 */
export function useSetupProgress(enabled = true): SetupProgress {
  const { currentUser } = useAuth();
  const { profile, carts, userKeys } = useMp();
  const uid = currentUser?.uid;
  const [devices, setDevices] = useState<DeviceDoc[]>([]);

  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(
      query(collection(db, 'devices'), where('userId', '==', uid)),
      (snap) => setDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DeviceDoc)),
      () => setDevices([]),
    );
  }, [enabled, uid]);

  const appPhones = enabled ? devices.filter((d) => d.source === 'tigon-iot-app' && d.status !== 'revoked') : [];
  const alertPhones = appPhones.filter((d) => d.isActive && !!d.fcmToken);
  const listing = carts.some((c) => c.createdBy === uid || postedTs(c, userKeys) > 0);
  const steps = { profile: !!profile, phone: appPhones.length > 0, alerts: alertPhones.length > 0, listing };
  return {
    ...steps,
    done: Object.values(steps).filter(Boolean).length,
    phones: appPhones.length,
    alertPhones: alertPhones.length,
  };
}
