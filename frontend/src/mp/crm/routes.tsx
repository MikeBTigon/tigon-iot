import type { ReactNode } from 'react';
import LeadsPage from './LeadsPage';
import CustomersPage from './CustomersPage';
import CalendarPage from './CalendarPage';
import InsightsPage from './InsightsPage';

/** Pages this area adds under the signed-in app (wrapped in the auth guard by mp/routes.tsx). */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/leads', element: <LeadsPage /> },
  { path: '/mp/customers', element: <CustomersPage /> },
  { path: '/mp/calendar', element: <CalendarPage /> },
  { path: '/mp/insights', element: <InsightsPage /> },
];
