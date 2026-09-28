import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMp } from '../mp/MpDataContext';
import type { Language } from '../mp/growthTypes';
import { applyLanguage } from '../i18n';
import { saveUserPref } from './prefs';

/** Returns a function that switches the UI language and saves it to the MP profile when there is one. */
export function useSetLanguage() {
  const { currentUser } = useAuth();
  const { profile } = useMp();
  const uid = profile ? currentUser?.uid : undefined;
  return useCallback((lang: Language) => {
    applyLanguage(lang);
    if (uid) void saveUserPref(uid, 'language', lang);
  }, [uid]);
}
