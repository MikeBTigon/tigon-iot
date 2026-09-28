import { lazy, Suspense, type ReactNode } from 'react';
import { Box, CircularProgress } from '@mui/material';

// Loaded on demand (the import page pulls in papaparse; the studio is canvas-heavy).
const MpNewListing = lazy(() => import('./MpNewListing'));
const MpTemplates = lazy(() => import('./MpTemplates'));
const MpImport = lazy(() => import('./MpImport'));

const wrap = (el: ReactNode) => (
  <Suspense fallback={<Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>}>{el}</Suspense>
);

/** Pages this area adds under the signed-in app (wrapped in the auth guard by mp/routes.tsx). */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/new', element: wrap(<MpNewListing />) },
  { path: '/mp/templates', element: wrap(<MpTemplates />) },
  { path: '/mp/import', element: wrap(<MpImport />) },
];
