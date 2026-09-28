// Small hooks shared by the Share pages.
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useMp } from '../MpDataContext';
import { COLLECTIONS } from '../constants';
import type { MpCart } from '../types';
import type { MpSettings } from '../growthTypes';

/** The cart with this doc id (loads it on its own when the cart list doesn't have it yet). */
export function useShareCart(cartId: string): { cart: MpCart | undefined; loading: boolean } {
  const { carts, cartsLoading, refreshCart, profile } = useMp();
  const cart = carts.find((c) => c.docId === cartId);
  useEffect(() => {
    if (profile && !cart && !cartsLoading && cartId) refreshCart(cartId).catch(() => undefined);
  }, [profile, cart, cartsLoading, cartId, refreshCart]);
  return { cart, loading: !cart && (cartsLoading || profile === undefined) };
}

let settingsPromise: Promise<Partial<MpSettings>> | null = null;

/** mp_settings/general (logo, default phone), read once per session. */
export function useMpSettings(): Partial<MpSettings> {
  const { profile } = useMp();
  const [settings, setSettings] = useState<Partial<MpSettings>>({});
  useEffect(() => {
    if (!profile) return;
    if (!settingsPromise) {
      settingsPromise = getDoc(doc(db, COLLECTIONS.settings, 'general'))
        .then((s) => (s.data() || {}) as Partial<MpSettings>)
        .catch(() => ({}));
    }
    let live = true;
    settingsPromise.then((s) => live && setSettings(s));
    return () => {
      live = false;
    };
  }, [profile]);
  return settings;
}
