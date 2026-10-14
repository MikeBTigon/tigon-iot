import { lazy, type ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { SignedInSuspense } from '../ui/PageSuspense';
import ProfilesRedirect from './pages/ProfilesRedirect';
import { ROUTES as CREATE_ROUTES } from './create/routes';
import { ROUTES as SHARE_ROUTES, PUBLIC_ROUTES } from './share/routes';
import { ROUTES as CRM_ROUTES } from './crm/routes';
import { ROUTES as TEAM_ROUTES } from './team/routes';
import { ROUTES as HELP_ROUTES } from './help/routes';
import { ROUTES as WH_ROUTES } from '../wh/routes';
import { ROUTES as SALES_ROUTES, PUBLIC_ROUTES as SALES_PUBLIC_ROUTES } from './sales/routes';
import { ROUTES as INSIGHTS_ROUTES, PUBLIC_ROUTES as INSIGHTS_PUBLIC_ROUTES } from './insights/routes';

// Every page loads on demand (its own chunk); the app frame shows a spinner meanwhile.
const MpHome = lazy(() => import('./pages/MpHome'));
const MpFind = lazy(() => import('./pages/MpFind'));
const MpLocations = lazy(() => import('./pages/MpLocations'));
const MpBrowse = lazy(() => import('./pages/MpBrowse'));
const MpAccounts = lazy(() => import('./pages/MpAccounts'));
const MpCartDetail = lazy(() => import('./pages/MpCartDetail'));
const MpFinance = lazy(() => import('./pages/MpFinance'));
const MpQueue = lazy(() => import('./pages/MpQueue'));
const MpPosted = lazy(() => import('./pages/MpPosted'));
const MpAnalytics = lazy(() => import('./pages/MpAnalytics'));
const MpPrepare = lazy(() => import('./pages/MpPrepare'));

const page = (el: ReactNode) => <SignedInSuspense>{el}</SignedInSuspense>;

/** MP Assistant routes; each element is wrapped by the caller's route guard. */
export const MP_ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp', element: page(<MpHome />) },
  { path: '/mp/find', element: page(<MpFind />) },
  { path: '/mp/finance', element: page(<MpFinance />) },
  { path: '/mp/locations', element: page(<MpLocations />) },
  { path: '/mp/locations/:loc', element: page(<MpLocations />) },
  { path: '/mp/browse', element: page(<MpBrowse />) },
  { path: '/mp/profiles', element: <ProfilesRedirect /> },
  { path: '/mp/accounts', element: page(<MpAccounts />) },
  { path: '/mp/cart/:id', element: page(<MpCartDetail />) },
  { path: '/mp/queue', element: page(<MpQueue />) },
  { path: '/mp/posted', element: page(<MpPosted />) },
  { path: '/mp/analytics', element: page(<MpAnalytics />) },
  { path: '/mp/post/:queueId', element: page(<MpPrepare />) },
  { path: '/mp/prepare/:cartId', element: page(<MpPrepare />) },
];

const AREA_ROUTES = [...CREATE_ROUTES, ...SHARE_ROUTES, ...CRM_ROUTES, ...TEAM_ROUTES, ...HELP_ROUTES, ...WH_ROUTES, ...SALES_ROUTES, ...INSIGHTS_ROUTES];

export function mpRoutes(guard: (el: React.ReactNode) => React.ReactNode) {
  return [...MP_ROUTES, ...AREA_ROUTES].map((r) => <Route key={r.path} path={r.path} element={guard(r.element)} />);
}

/** Public (no sign-in) customer pages such as storefronts, quotes and booking. Rendered outside the signed-in app. */
export const PUBLIC_PAGE_ROUTES: Array<{ path: string; element: ReactNode }> = [...PUBLIC_ROUTES, ...SALES_PUBLIC_ROUTES, ...INSIGHTS_PUBLIC_ROUTES];

export function publicRoutes(wrap: (el: React.ReactNode) => React.ReactNode = (el) => el) {
  return PUBLIC_PAGE_ROUTES.map((r) => <Route key={r.path} path={r.path} element={wrap(r.element)} />);
}
