// Insights (Harden & polish release) — pages. Signed-in pages go in ROUTES (wrapped by the app's auth guard),
// the customer credit application in PUBLIC_ROUTES. Pages load on demand.
import { lazy, Suspense, type ReactNode } from 'react';

const CustomerPage = lazy(() => import('./CustomerPage'));
const LiveBoard = lazy(() => import('./LiveBoard'));
const InboxPage = lazy(() => import('./InboxPage'));
const CreditAppsPage = lazy(() => import('./credit/CreditAppsPage'));
const CreditPublicPage = lazy(() => import('./credit/CreditPublicPage'));

const page = (el: ReactNode) => <Suspense fallback={null}>{el}</Suspense>;

export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/customer', element: page(<CustomerPage />) },
  { path: '/mp/customer/:phone', element: page(<CustomerPage />) },
  { path: '/mp/live', element: page(<LiveBoard />) },
  { path: '/mp/inbox', element: page(<InboxPage />) },
  { path: '/mp/credit-app', element: page(<CreditAppsPage />) },
  { path: '/mp/credit-app/:leadId', element: page(<CreditAppsPage />) },
];

/** Customer pages (no sign-in). */
export const PUBLIC_ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/apply', element: page(<CreditPublicPage />) },
];
