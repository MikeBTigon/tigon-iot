import { lazy, type ReactNode } from 'react';
import { SignedInSuspense } from '../../ui/PageSuspense';

const LeadsPage = lazy(() => import('./LeadsPage'));
const CustomersPage = lazy(() => import('./CustomersPage'));
const CalendarPage = lazy(() => import('./CalendarPage'));
const InsightsPage = lazy(() => import('./InsightsPage'));

const page = (el: ReactNode) => <SignedInSuspense>{el}</SignedInSuspense>;

/** Pages this area adds under the signed-in app (wrapped in the auth guard by mp/routes.tsx). Loaded on demand. */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/leads', element: page(<LeadsPage />) },
  { path: '/mp/customers', element: page(<CustomersPage />) },
  { path: '/mp/calendar', element: page(<CalendarPage />) },
  { path: '/mp/insights', element: page(<InsightsPage />) },
];
