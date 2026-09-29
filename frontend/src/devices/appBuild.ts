import { useEffect, useState } from 'react';

/**
 * The app file is served from the Firebase default domain on purpose: that origin has no offline cache
 * (service worker) of ours, so the browser always downloads the real file. (On tigoniot.com an older
 * cached copy of the website could intercept the link and show a blank page.)
 */
export const APK_URL = 'https://tigon-iot.firebaseapp.com/downloads/tigon-iot.apk';
export const PUBLIC_APP_PAGE = 'https://tigoniot.com/app';

export interface AppBuild { versionCode: number; versionName: string; builtAt: string; url: string }

/** Latest Android build published by the deploy (/downloads/version.json). null = not published yet. */
export function useLatestAppBuild(): AppBuild | null | undefined {
  const [build, setBuild] = useState<AppBuild | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch('/downloads/version.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setBuild(j && j.versionCode ? (j as AppBuild) : null); })
      .catch(() => { if (alive) setBuild(null); });
    return () => { alive = false; };
  }, []);
  return build;
}

