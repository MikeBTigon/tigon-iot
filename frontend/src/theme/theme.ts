import { createTheme, type Theme } from '@mui/material/styles';

/** Options the theme is built from (see ui/ThemeModeProvider). */
export interface ThemeOptions {
  mode: 'light' | 'dark';
  /** Bigger type and touch targets for readability. */
  largeText?: boolean;
}

/**
 * Brand theme. Light keeps the classic red #af1f31 / blue #0e4671; dark uses lighter tints of the
 * same colors so buttons and links keep enough contrast on #121212 / #1e1e1e surfaces.
 */
export function buildTheme({ mode, largeText = false }: ThemeOptions): Theme {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: dark
        ? { main: '#d94d5f', light: '#e57b89', dark: '#af1f31', contrastText: '#ffffff' }
        : { main: '#af1f31', light: '#d94d5f', dark: '#7a1522', contrastText: '#ffffff' },
      secondary: dark
        ? { main: '#5b8fbd', light: '#86afd3', dark: '#3d6e95', contrastText: '#ffffff' }
        : { main: '#0e4671', light: '#3d6e95', dark: '#09304f', contrastText: '#ffffff' },
      background: dark ? { default: '#121212', paper: '#1e1e1e' } : { default: '#f5f5f5', paper: '#ffffff' },
      success: { main: dark ? '#66bb6a' : '#4caf50' },
      error: { main: dark ? '#f66a5e' : '#f44336' },
      warning: { main: '#ff9800' },
      // Existing pages use grey.50/100/200 as "light box" backgrounds and borders; in dark mode these
      // shades become dark surfaces so the text inside stays readable.
      ...(dark ? { grey: { 50: '#262626', 100: '#2c2c2c', 200: '#3a3a3a' } } : {}),
    },
    typography: {
      // MUI scales every rem size by fontSize / 14, so 16 makes all text ~14% larger.
      fontSize: largeText ? 16 : 14,
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h1: { fontSize: '2.5rem', fontWeight: 600 },
      h2: { fontSize: '2rem', fontWeight: 600 },
      h3: { fontSize: '1.75rem', fontWeight: 600 },
      h4: { fontSize: '1.5rem', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 8,
            ...(largeText ? { minHeight: 44, paddingLeft: 18, paddingRight: 18 } : {}),
          },
        },
      },
      MuiIconButton: {
        styleOverrides: largeText ? { root: { minWidth: 44, minHeight: 44 } } : {},
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow: dark ? '0 2px 8px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.1)',
          },
        },
      },
      // Visible keyboard focus everywhere (mouse clicks don't show it).
      MuiButtonBase: {
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': {
              outline: `2px solid ${dark ? '#86afd3' : '#0e4671'}`,
              outlineOffset: 2,
            },
          },
        },
      },
    },
  });
}

/** Default light theme (kept for any code that imports it directly). */
export const theme = buildTheme({ mode: 'light' });
