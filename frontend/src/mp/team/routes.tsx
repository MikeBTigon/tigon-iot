import type { ReactNode } from 'react';
import MpTeam from './MpTeam';
import MpAssets from './MpAssets';
import MpSettings from './MpSettings';
import MpStatus from './MpStatus';
import MpExports from './MpExports';
import MpReport from './MpReport';

/** Pages this area adds under the signed-in app (wrapped in the auth guard by mp/routes.tsx). */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/team', element: <MpTeam /> },
  { path: '/mp/assets', element: <MpAssets /> },
  { path: '/mp/settings', element: <MpSettings /> },
  { path: '/mp/status', element: <MpStatus /> },
  { path: '/mp/exports', element: <MpExports /> },
  // Print-optimized (no app chrome); opened from Exports.
  { path: '/mp/report', element: <MpReport /> },
];
