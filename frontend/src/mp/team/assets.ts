// Brand asset library (mp_assets) — live list shared by the Assets page and the Settings logo picker.
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from '../constants';
import type { BrandAsset } from '../growthTypes';

/** Live brand library (everyone can read it). */
export function useBrandAssets(): { assets: BrandAsset[]; loaded: boolean; error: string } {
  const [state, setState] = useState<{ assets: BrandAsset[]; loaded: boolean; error: string }>({ assets: [], loaded: false, error: '' });
  useEffect(
    () =>
      onSnapshot(
        collection(db, COLLECTIONS.assets),
        (snap) => setState({
          assets: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BrandAsset).sort((a, b) => b.createdAt - a.createdAt),
          loaded: true,
          error: '',
        }),
        (e) => setState({ assets: [], loaded: true, error: e.message }),
      ),
    [],
  );
  return state;
}
