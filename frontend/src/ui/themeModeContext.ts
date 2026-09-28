import { createContext, useContext } from 'react';
import type { UserPrefs } from '../mp/growthTypes';

/** 'system' follows the device's light/dark setting. */
export type ThemePref = NonNullable<UserPrefs['theme']>;

export interface ThemeModeValue {
  /** What the user picked. */
  mode: ThemePref;
  /** What is showing now. */
  resolved: 'light' | 'dark';
  largeText: boolean;
  setMode: (mode: ThemePref) => void;
  setLargeText: (on: boolean) => void;
}

export const ThemeModeContext = createContext<ThemeModeValue | undefined>(undefined);

/** Theme mode + large text controls (inside <ThemeModeProvider>). */
export function useThemeMode(): ThemeModeValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
  return ctx;
}
