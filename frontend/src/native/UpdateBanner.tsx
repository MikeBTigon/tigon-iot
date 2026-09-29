import React, { useEffect, useState } from 'react';
import { Alert, Button } from '@mui/material';
import { isNativeApp, nativePlatform } from './platform';
import { openExternal } from './actions';

const SITE = 'https://tigoniot.com';

/** Android app: shows "Update available" when the website has a newer build than the installed one. */
const UpdateBanner: React.FC = () => {
  const [latest, setLatest] = useState<{ versionName: string } | null>(null);
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
        if (alive && Number(v.versionCode) > Number(info.build || 0)) setLatest({ versionName: String(v.versionName || '') });
      } catch {
        // offline or not published yet
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!latest || hidden) return null;
  return (
    <Alert severity="info" sx={{ mb: 2 }} onClose={() => setHidden(true)} action={
      <Button color="inherit" size="small" onClick={() => openExternal(`${SITE}/downloads/tigon-iot.apk`)}>Update</Button>
    }>
      A new version of the TIGON IOT app is ready ({latest.versionName}). Tap Update, open the file and tap Install —
      you stay signed in.
    </Alert>
  );
};

export default UpdateBanner;
