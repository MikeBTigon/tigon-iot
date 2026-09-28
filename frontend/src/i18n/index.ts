/**
 * App translations (English, Spanish, French, Haitian Creole) via i18next + react-i18next.
 * Import this module once (main.tsx) before rendering. Other code uses `useT()` (or `useTranslation()`).
 *
 * Language choice order: the user's MP profile prefs (applied by <LanguageSync/> once signed in)
 * → localStorage → the browser/phone language → English.
 */
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import type { Language } from '../mp/growthTypes';
import en from './en';
import es from './es';
import fr from './fr';
import ht from './ht';

/** Languages offered in the pickers, with their own-language names. */
export const LANGUAGES: Array<{ code: Language; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'ht', label: 'Kreyòl ayisyen' },
];

const STORAGE_KEY = 'tigon.language';
const CODES = LANGUAGES.map((l) => l.code) as string[];

/** Narrows any string to a supported language, or undefined. */
export function asLanguage(v: unknown): Language | undefined {
  if (typeof v !== 'string') return undefined;
  const base = v.toLowerCase().split(/[-_]/)[0];
  return CODES.includes(base) ? (base as Language) : undefined;
}

function storedLanguage(): Language | undefined {
  try {
    return asLanguage(localStorage.getItem(STORAGE_KEY));
  } catch {
    return undefined;
  }
}

/** Initial language before the user's profile loads. */
export function detectLanguage(): Language {
  const fromNavigator = typeof navigator !== 'undefined'
    ? (navigator.languages || [navigator.language]).map(asLanguage).find(Boolean)
    : undefined;
  return storedLanguage() || fromNavigator || 'en';
}

const initial = detectLanguage();

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es }, fr: { translation: fr }, ht: { translation: ht } },
  lng: initial,
  fallbackLng: 'en',
  supportedLngs: CODES,
  interpolation: { escapeValue: false }, // React already escapes
});

if (typeof document !== 'undefined') document.documentElement.lang = initial;

/** Switches the UI language now and remembers it on this device (Firestore prefs are saved by the caller). */
export function applyLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage unavailable (private mode) — the choice still applies for this session
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
}

/** Current UI language as a supported code. */
export const currentLanguage = (): Language => asLanguage(i18n.language) || 'en';

/** Translation function for components: `const t = useT(); t('nav.home')`. */
export function useT() {
  return useTranslation().t;
}

/** Current language code, re-rendering when it changes. */
export function useLanguage(): Language {
  const { i18n: inst } = useTranslation();
  return asLanguage(inst.language) || 'en';
}

export default i18n;
