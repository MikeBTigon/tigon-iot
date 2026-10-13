import React, { useEffect, useState } from 'react';
import { Alert, AlertTitle, Button } from '@mui/material';
import { isNativeApp, nativePlatform } from './platform';
import { openExternal } from './actions';
import { APK_URL, PUBLIC_APP_PAGE } from '../devices/appBuild';

const SITE = 'https://tigoniot.com';

type UpdateState =
  | { kind: 'update'; versionName: string }
  // The installed app was signed with the old (retired) key: Android can't update it, it must be reinstalled once.
  | { kind: 'reinstall'; versionName: string };

/**
 * Android app: compares the installed build with /downloads/version.json.
 * - newer build → "Update available" (can be closed);
 * - installed build below `minVersionCode` → "Reinstall needed" (stays until the app is reinstalled).
 */
const UpdateBanner: React.FC = () => {
  const [state, setState] = useState<UpdateState | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!isNativeApp() || nativePlatform() !== 'android') return;
    let alive = true;
    (async () => {
      try {
        const [{ App }, res] = await Promise.all([import('@capacitor/app'), fetch(`${SITE}/downloads/version.json`, { cache: 'no-store' })]);
        if (!res.ok) return;
        const v = await res.json();
        const info = await App.getInfo();
        const installed = Number(info.build || 0);
        const latest = Number(v.versionCode || 0);
        const minCode = Number(v.minVersionCode || 0);
        const versionName = String(v.versionName || '');
        if (!alive) return;
        if (v.requiresReinstall !== false && minCode > 0 && installed > 0 && installed < minCode) {
          setState({ kind: 'reinstall', versionName });
        } else if (latest > installed) {
          setState({ kind: 'update', versionName });
        }
      } catch {
        // offline or not published yet
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!state) return null;

  if (state.kind === 'reinstall') {
    return (
      <Alert severity="warning" sx={{ mb: 2 }} action={
        <Button color="inherit" size="small" onClick={() => openExternal(PUBLIC_APP_PAGE)}>Download</Button>
      }>
        <AlertTitle>Reinstall needed: uninstall TIGON IOT, then install the new version</AlertTitle>
        This one time, the new app can't install over this one. Tap <b>Download</b> first. Then press and hold the
        TIGON IOT icon → <b>Uninstall</b>, open the downloaded file and tap <b>Install</b>. After that, set the phone up
        again (Devices → Set up a phone on a computer, then scan the QR code).
      </Alert>
    );
  }

  if (hidden) return null;
  return (
    <Alert severity="info" sx={{ mb: 2 }} onClose={() => setHidden(true)} action={
      <Button color="inherit" size="small" onClick={() => openExternal(APK_URL)}>Update</Button>
    }>
      A new version of the TIGON IOT app is ready ({state.versionName}). Tap Update, open the file and tap Install —
      you stay signed in.
    </Alert>
  );
};

export default UpdateBanner;
