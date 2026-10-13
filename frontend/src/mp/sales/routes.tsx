// "Sell more" release — pages (signed-in and public). Pages load on demand.
import { lazy, type ReactNode } from 'react';
import { PublicSuspense, SignedInSuspense } from '../../ui/PageSuspense';

const TodayPage = lazy(() => import('./speed/TodayPage'));
const TextsPage = lazy(() => import('./texting/TextsPage'));
const AppointmentsPage = lazy(() => import('./closing/AppointmentsPage'));
const QuotesPage = lazy(() => import('./closing/QuotesPage'));
const TradeInsPage = lazy(() => import('./closing/TradeInsPage'));
const PrequalsPage = lazy(() => import('./closing/PrequalsPage'));
const AgedPage = lazy(() => import('./inventory/AgedPage'));
const ReferralsPage = lazy(() => import('./marketing/ReferralsPage'));
const FunnelPage = lazy(() => import('./marketing/FunnelPage'));
const ReviewsPage = lazy(() => import('./marketing/ReviewsPage'));
const SalesSettingsPage = lazy(() => import('./SalesSettingsPage'));

const QuotePublicPage = lazy(() => import('./closing/QuotePublicPage'));
const BookPublicPage = lazy(() => import('./closing/BookPublicPage'));
const TradePublicPage = lazy(() => import('./closing/TradePublicPage'));
const PrequalPublicPage = lazy(() => import('./closing/PrequalPublicPage'));
const ReferralPublicPage = lazy(() => import('./marketing/ReferralPublicPage'));
const SimilarPublicPage = lazy(() => import('./inventory/SimilarPublicPage'));

const page = (el: ReactNode) => <SignedInSuspense>{el}</SignedInSuspense>;
const publicPage = (el: ReactNode) => <PublicSuspense>{el}</PublicSuspense>;

export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/today', element: page(<TodayPage />) },
  { path: '/mp/texts', element: page(<TextsPage />) },
  { path: '/mp/appointments', element: page(<AppointmentsPage />) },
  { path: '/mp/quotes', element: page(<QuotesPage />) },
  { path: '/mp/trade-ins', element: page(<TradeInsPage />) },
  { path: '/mp/prequal', element: page(<PrequalsPage />) },
  { path: '/mp/aged', element: page(<AgedPage />) },
  { path: '/mp/referrals', element: page(<ReferralsPage />) },
  { path: '/mp/funnel', element: page(<FunnelPage />) },
  { path: '/mp/reviews', element: page(<ReviewsPage />) },
  { path: '/mp/sales-settings', element: page(<SalesSettingsPage />) },
];

/** Customer pages (no sign-in). */
export const PUBLIC_ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/q/:code', element: publicPage(<QuotePublicPage />) },
  { path: '/book', element: publicPage(<BookPublicPage />) },
  { path: '/book/:storeId', element: publicPage(<BookPublicPage />) },
  { path: '/trade', element: publicPage(<TradePublicPage />) },
  { path: '/prequal', element: publicPage(<PrequalPublicPage />) },
  { path: '/r/:code', element: publicPage(<ReferralPublicPage />) },
  { path: '/similar/:cartId', element: publicPage(<SimilarPublicPage />) },
];
