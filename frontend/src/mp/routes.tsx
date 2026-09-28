import { Route } from 'react-router-dom';
import MpHome from './pages/MpHome';
import MpFind from './pages/MpFind';
import MpLocations from './pages/MpLocations';
import MpBrowse from './pages/MpBrowse';
import MpProfiles from './pages/MpProfiles';
import MpAccounts from './pages/MpAccounts';
import MpCartDetail from './pages/MpCartDetail';
import MpQueue from './pages/MpQueue';
import MpAnalytics from './pages/MpAnalytics';
import MpPrepare from './pages/MpPrepare';
import { ROUTES as CREATE_ROUTES } from './create/routes';
import { ROUTES as SHARE_ROUTES, PUBLIC_ROUTES } from './share/routes';
import { ROUTES as CRM_ROUTES } from './crm/routes';
import { ROUTES as TEAM_ROUTES } from './team/routes';
import { ROUTES as HELP_ROUTES } from './help/routes';
import { ROUTES as WH_ROUTES } from '../wh/routes';

/** MP Assistant routes; each element is wrapped by the caller's route guard. */
export const MP_ROUTES = [
  { path: '/mp', element: <MpHome /> },
  { path: '/mp/find', element: <MpFind /> },
  { path: '/mp/locations', element: <MpLocations /> },
  { path: '/mp/locations/:loc', element: <MpLocations /> },
  { path: '/mp/browse', element: <MpBrowse /> },
  { path: '/mp/profiles', element: <MpProfiles /> },
  { path: '/mp/accounts', element: <MpAccounts /> },
  { path: '/mp/cart/:id', element: <MpCartDetail /> },
  { path: '/mp/queue', element: <MpQueue /> },
  { path: '/mp/analytics', element: <MpAnalytics /> },
  { path: '/mp/post/:queueId', element: <MpPrepare /> },
  { path: '/mp/prepare/:cartId', element: <MpPrepare /> },
];

const AREA_ROUTES = [...CREATE_ROUTES, ...SHARE_ROUTES, ...CRM_ROUTES, ...TEAM_ROUTES, ...HELP_ROUTES, ...WH_ROUTES];

export function mpRoutes(guard: (el: React.ReactNode) => React.ReactNode) {
  return [...MP_ROUTES, ...AREA_ROUTES].map((r) => <Route key={r.path} path={r.path} element={guard(r.element)} />);
}

/** Public (no sign-in) routes such as storefronts. */
export function publicRoutes() {
  return PUBLIC_ROUTES.map((r) => <Route key={r.path} path={r.path} element={r.element} />);
}
