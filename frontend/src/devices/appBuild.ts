import { useEffect, useState } from 'react';

export const APK_URL = '/downloads/tigon-iot.apk';
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

