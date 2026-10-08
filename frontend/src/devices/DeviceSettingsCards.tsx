import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Button, Chip, FormControlLabel, MenuItem, Paper, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { Brightness6, Info, Language as LanguageIcon, PhoneAndroid, SystemUpdate } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { LANGUAGES, useLanguage } from '../i18n';
import { useThemeMode } from '../ui/themeModeContext';
import type { ThemePref } from '../ui/themeModeContext';
import { useSetLanguage } from '../ui/useSetLanguage';
import type { DeviceDoc } from '../mp/types';
import EchoCard from '../native/EchoCard';
import { isNativeApp, nativePlatform } from '../native/platform';
import { openExternal } from '../native/actions';
import { APK_URL } from './appBuild';
import { isOnline, seenLabel } from './deviceStatus';
import { phoneSummary } from './phoneSetup';

const Box1: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
    </Box>
    {children}
  </Paper>
);

/** Installed app version vs the newest one on the website (Android app). */
function useAppVersions() {
  const [v, setV] = useState<{ installed: string; installedCode: number; latest: string; latestCode: number } | null>(null);
  useEffect(() => {
    if (!isNativeApp()) return;
    let alive = true;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        let latest = '';
        let latestCode = 0;
        try {
          const res = await fetch('https://tigoniot.com/downloads/version.json', { cache: 'no-store' });
          if (res.ok) {
            const j = await res.json();
            latest = String(j.versionName || '');
            latestCode = Number(j.versionCode || 0);
          }
        } catch { /* offline */ }
        if (alive) setV({ installed: info.version, installedCode: Number(info.build || 0), latest, latestCode });
      } catch { /* not available */ }
    })();
    return () => { alive = false; };
  }, []);
  return v;
}

/** "Settings on this device": this phone, display, notification forwarding, app version. */
const DeviceSettingsCards: React.FC<{ device: DeviceDoc | null | undefined }> = ({ device }) => {
  const { currentUser } = useAuth();
  const native = isNativeApp();
  const { mode, setMode, largeText, setLargeText } = useThemeMode();
  const lang = useLanguage();
  const setLanguage = useSetLanguage();
  const versions = useAppVersions();
  const updateReady = !!versions && versions.latestCode > versions.installedCode;

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h5" color="primary" sx={{ mb: 2 }}>Settings on this device</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Box1 icon={<PhoneAndroid />} title={native ? 'This phone' : 'Phone shown on this computer'}>
          {device ? (
            <>
              <Typography sx={{ fontWeight: 600 }}>{device.deviceName || 'Phone'}</Typography>
              {phoneSummary(device) && <Typography variant="body2" color="text.secondary">{phoneSummary(device)}</Typography>}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', my: 1 }}>
                <Chip size="small" color={isOnline(device) ? 'success' : 'default'} label={isOnline(device) ? 'Online' : `Seen ${seenLabel(device)}`} />
                {device.platform && <Chip size="small" variant="outlined" label={[device.platform, device.model].filter(Boolean).join(' · ')} />}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Signed in as {currentUser?.email}
              </Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>No phone is set up here yet.</Typography>
          )}
          <Button size="small" variant="outlined" component={RouterLink} to="/devices">Phone number, location & account</Button>
        </Box1>

        <Box1 icon={<Brightness6 />} title="Display">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Light or dark</Typography>
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_e, v: ThemePref | null) => v && setMode(v)} sx={{ mb: 1.5 }}>
            <ToggleButton value="system">Automatic</ToggleButton>
            <ToggleButton value="light">Light</ToggleButton>
            <ToggleButton value="dark">Dark</ToggleButton>
          </ToggleButtonGroup>
          <FormControlLabel control={<Switch checked={largeText} onChange={(e) => setLargeText(e.target.checked)} />} label="Large text" sx={{ display: 'block', mb: 1 }} />
          <TextField select size="small" label="Language" value={lang} onChange={(e) => setLanguage(e.target.value as typeof lang)} sx={{ minWidth: 200 }}
            slotProps={{ input: { startAdornment: <LanguageIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> } }}>
            {LANGUAGES.map((l) => <MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}
          </TextField>
        </Box1>

        {native && nativePlatform() === 'android' && (
          <Box sx={{ gridColumn: { md: '1 / -1' } }}>
            <EchoCard />
          </Box>
        )}

        {native ? (
          <Box1 icon={<SystemUpdate />} title="App version">
            {!versions ? (
              <Typography variant="body2" color="text.secondary">Checking…</Typography>
            ) : (
              <>
                <Typography variant="body2">Installed: <b>{versions.installed}</b>{versions.latest ? <> · Newest: <b>{versions.latest}</b></> : null}</Typography>
                <Chip size="small" sx={{ my: 1 }} color={updateReady ? 'warning' : 'success'} label={updateReady ? 'Update available' : 'Up to date'} />
                {updateReady && (
                  <Box>
                    <Button size="small" variant="contained" onClick={() => openExternal(APK_URL)}>Update the app</Button>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Open the file and tap Install — you stay signed in.</Typography>
                  </Box>
                )}
              </>
            )}
          </Box1>
        ) : (
          <Box1 icon={<Info />} title="This computer">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Notifications and phone alerts come from phones running the TIGON IOT app. On a computer you can still use MP Assistant,
              Webhook Flows and the Organization tab.
            </Typography>
            <Button size="small" variant="outlined" component={RouterLink} to="/download">Get the phone app</Button>
          </Box1>
        )}
      </Box>
    </Box>
  );
};

export default DeviceSettingsCards;
