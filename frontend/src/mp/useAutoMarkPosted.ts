// Quick FB List auto-marks the cart as posted on the Facebook account being used:
//   the queue item's account → this phone's account (Devices page) → the account last marked on this computer.
// With none known it marks the cart as posted by this person. Every mark can be undone.
import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { isNativeApp } from '../native/platform';
import { currentDeviceId } from '../native/deviceSession';
import { readLocal, writeLocal } from '../ui/prefs';
import { useMp } from './MpDataContext';
import type { MpCart } from './types';

const LAST_ACCOUNT_KEY = 'mp.lastPostingAccount';

/** Remember the account someone marked on this device (used when the phone has none set). */
export const rememberPostingAccount = (accountId: string) => writeLocal(LAST_ACCOUNT_KEY, accountId);

async function phoneAccount(): Promise<string> {
  const id = currentDeviceId();
  if (!isNativeApp() || id === 'web') return '';
  try {
    return String((await getDoc(doc(db, 'devices', id))).get('accountId') || '');
  } catch {
    return '';
  }
}

/** The Facebook account this person most likely posts on here: this phone's account, else the last one marked on this device. */
export function usePostingAccountId(): string {
  const [id, setId] = useState(() => readLocal(LAST_ACCOUNT_KEY) || '');
  useEffect(() => {
    let live = true;
    phoneAccount().then((a) => live && a && setId(a));
    return () => {
      live = false;
    };
  }, []);
  return id;
}

export function useAutoMarkPosted() {
  const { accounts, setPosted, setPostedAccounts, userKeys } = useMp();
  return useCallback(
    async (cart: MpCart, queueAccountId = ''): Promise<{ note: string; undo: () => Promise<void> }> => {
      const candidates = [queueAccountId, await phoneAccount(), readLocal(LAST_ACCOUNT_KEY) || ''];
      const account = candidates.map((id) => accounts.find((a) => a.id === id)).find(Boolean);
      if (account) {
        if (cart.postedAccounts[account.id]) return { note: `Already marked as posted on ${account.name}.`, undo: async () => {} };
        await setPostedAccounts(cart, [account.id], []);
        return { note: `Marked as posted on ${account.name}.`, undo: () => setPostedAccounts(cart, [], [account.id]) };
      }
      const already = userKeys.some((k) => cart.postedBy[k]);
      if (already) return { note: '', undo: async () => {} };
      await setPosted(cart, true);
      return { note: 'Marked as posted.', undo: () => setPosted(cart, false) };
    },
    [accounts, setPosted, setPostedAccounts, userKeys],
  );
}
