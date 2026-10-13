import { lazy, type ReactNode } from 'react';
import { SignedInSuspense } from '../../ui/PageSuspense';

// Loaded on demand (the import page pulls in papaparse; the studio is canvas-heavy).
const MpNewListing = lazy(() => import('./MpNewListing'));
const MpTemplates = lazy(() => import('./MpTemplates'));
const MpImport = lazy(() => import('./MpImport'));

const wrap = (el: ReactNode) => <SignedInSuspense>{el}</SignedInSuspense>;

/** Pages this area adds under the signed-in app (wrapped in the auth guard by mp/routes.tsx). */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/new', element: wrap(<MpNewListing />) },
  { path: '/mp/templates', element: wrap(<MpTemplates />) },
  { path: '/mp/import', element: wrap(<MpImport />) },
];
