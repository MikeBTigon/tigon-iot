import { lazy, type ReactNode } from 'react';
import { SignedInSuspense } from '../../ui/PageSuspense';

const MpTeam = lazy(() => import('./MpTeam'));
const MpAssets = lazy(() => import('./MpAssets'));
const MpSettings = lazy(() => import('./MpSettings'));
const MpStatus = lazy(() => import('./MpStatus'));
const MpExports = lazy(() => import('./MpExports'));
const MpReport = lazy(() => import('./MpReport'));

const page = (el: ReactNode) => <SignedInSuspense>{el}</SignedInSuspense>;

/** Pages this area adds under the signed-in app (wrapped in the auth guard by mp/routes.tsx). Loaded on demand. */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/team', element: page(<MpTeam />) },
  { path: '/mp/assets', element: page(<MpAssets />) },
  { path: '/mp/settings', element: page(<MpSettings />) },
  // System health: phones/queue/sync/backups + the "Website forms problems" tab (?tab=forms).
  { path: '/mp/status', element: page(<MpStatus />) },
  { path: '/mp/exports', element: page(<MpExports />) },
  // Print-optimized (no app chrome); opened from Exports.
  { path: '/mp/report', element: page(<MpReport />) },
];
