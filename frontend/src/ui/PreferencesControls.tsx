import React from 'react';
import {
  Box, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Switch, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { BrightnessAuto, DarkMode, LightMode } from '@mui/icons-material';
import { LANGUAGES, asLanguage, useLanguage, useT } from '../i18n';
import { useThemeMode, type ThemePref } from './themeModeContext';
import { useSetLanguage } from './useSetLanguage';

/** Language picker + light/dark/system + large text. Used in the Help center and the setup guide. */
const PreferencesControls: React.FC<{ showTitle?: boolean }> = ({ showTitle }) => {
  const t = useT();
  const lang = useLanguage();
  const setLanguage = useSetLanguage();
  const { mode, setMode, largeText, setLargeText } = useThemeMode();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {showTitle && <Typography variant="h6">{t('prefs.title')}</Typography>}
      <FormControl fullWidth size="small">
        <InputLabel id="pref-lang-label">{t('prefs.language')}</InputLabel>
        <Select
          labelId="pref-lang-label"
          label={t('prefs.language')}
          value={lang}
          onChange={(e) => {
            const next = asLanguage(e.target.value);
            if (next) setLanguage(next);
          }}
        >
          {LANGUAGES.map((l) => <MenuItem key={l.code} value={l.code} lang={l.code}>{l.label}</MenuItem>)}
        </Select>
      </FormControl>
      <Box>
        <Typography variant="body2" color="text.secondary" id="pref-theme-label" sx={{ mb: 0.5 }}>{t('prefs.theme')}</Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          aria-labelledby="pref-theme-label"
          onChange={(_, v: ThemePref | null) => v && setMode(v)}
          sx={{ flexWrap: 'wrap' }}
        >
          <ToggleButton value="system"><BrightnessAuto fontSize="small" sx={{ mr: 0.5 }} />{t('prefs.themeSystem')}</ToggleButton>
          <ToggleButton value="light"><LightMode fontSize="small" sx={{ mr: 0.5 }} />{t('prefs.themeLight')}</ToggleButton>
          <ToggleButton value="dark"><DarkMode fontSize="small" sx={{ mr: 0.5 }} />{t('prefs.themeDark')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <FormControlLabel
        control={<Switch checked={largeText} onChange={(e) => setLargeText(e.target.checked)} />}
        label={
          <Box>
            <Typography>{t('prefs.largeText')}</Typography>
            <Typography variant="caption" color="text.secondary">{t('prefs.largeTextHint')}</Typography>
          </Box>
        }
      />
    </Box>
  );
};

export default PreferencesControls;
