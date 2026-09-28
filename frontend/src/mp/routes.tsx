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

export function mpRoutes(guard: (el: React.ReactNode) => React.ReactNode) {
  return MP_ROUTES.map((r) => <Route key={r.path} path={r.path} element={guard(r.element)} />);
}
