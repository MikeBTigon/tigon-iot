import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';
import { buildTheme } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { useMp } from '../mp/MpDataContext';
import { applyLanguage, asLanguage, currentLanguage } from '../i18n';
import { prefsOf, readLocal, saveUserPref, writeLocal } from './prefs';
import { ThemeModeContext, type ThemePref } from './themeModeContext';

const THEME_KEY = 'tigon.theme';
const LARGE_KEY = 'tigon.largeText';

const asThemePref = (v: unknown): ThemePref | undefined =>
  v === 'light' || v === 'dark' || v === 'system' ? v : undefined;

/**
 * Light/dark mode + large text for the whole app, and the signed-in user's language.
 * Order: a choice made in this session → the MP profile prefs → this device (localStorage) → system.
 * Must sit inside AuthProvider and MpDataProvider.
 */
const ThemeModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { profile } = useMp();
  const prefs = prefsOf(profile);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const [chosenMode, setChosenMode] = useState<ThemePref | null>(null);
  const [chosenLarge, setChosenLarge] = useState<boolean | null>(null);
  const [storedMode] = useState(() => asThemePref(readLocal(THEME_KEY)));
  const [storedLarge] = useState(() => readLocal(LARGE_KEY) === '1');

  const mode: ThemePref = chosenMode ?? prefs.theme ?? storedMode ?? 'system';
  const largeText = chosenLarge ?? prefs.largeText ?? storedLarge;
  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
  const uid = profile ? currentUser?.uid : undefined;

  // Apply the language saved on the profile (e.g. chosen on another device).
  const prefLang = asLanguage(prefs.language);
  useEffect(() => {
    if (prefLang && prefLang !== currentLanguage()) applyLanguage(prefLang);
  }, [prefLang]);

  const setMode = useCallback((m: ThemePref) => {
    setChosenMode(m);
    writeLocal(THEME_KEY, m);
    if (uid) void saveUserPref(uid, 'theme', m);
  }, [uid, setChosenMode]);

  const setLargeText = useCallback((on: boolean) => {
    setChosenLarge(on);
    writeLocal(LARGE_KEY, on ? '1' : '0');
    if (uid) void saveUserPref(uid, 'largeText', on);
  }, [uid, setChosenLarge]);

  const theme = useMemo(() => buildTheme({ mode: resolved, largeText }), [resolved, largeText]);
  const value = useMemo(
    () => ({ mode, resolved, largeText, setMode, setLargeText }),
    [mode, resolved, largeText, setMode, setLargeText],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
};

export default ThemeModeProvider;
