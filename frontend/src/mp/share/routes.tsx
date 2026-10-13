import { lazy, type ReactNode } from 'react';
import { PublicSuspense, SignedInSuspense } from '../../ui/PageSuspense';

// Pages load on demand so the canvas/video/QR code and public storefront stay out of the main bundle.
const ShareKit = lazy(() => import('./ShareKit'));
const Flyer = lazy(() => import('./Flyer'));
const StorefrontEditor = lazy(() => import('./StorefrontEditor'));
const LinksPage = lazy(() => import('./LinksPage'));
const StorefrontPage = lazy(() => import('../../storefront/StorefrontPage'));
const StorefrontCartPage = lazy(() => import('../../storefront/StorefrontCartPage'));

const page = (el: ReactNode) => <SignedInSuspense>{el}</SignedInSuspense>;
const publicPage = (el: ReactNode) => <PublicSuspense>{el}</PublicSuspense>;

/** Pages this area adds under the signed-in app (wrapped in the auth guard by mp/routes.tsx). */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/share/:cartId', element: page(<ShareKit />) },
  { path: '/mp/flyer/:cartId', element: page(<Flyer />) },
  { path: '/mp/storefront', element: page(<StorefrontEditor />) },
  { path: '/mp/links', element: page(<LinksPage />) },
];

/** Public pages (no sign-in), e.g. storefronts at /s/:slug. */
export const PUBLIC_ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/s/:slug', element: publicPage(<StorefrontPage />) },
  { path: '/s/:slug/:cartId', element: publicPage(<StorefrontCartPage />) },
  // SEO-friendly cart URL: the trailing slug is for readability/search; the cartId is what the page looks up.
  { path: '/s/:slug/:cartId/:seo', element: publicPage(<StorefrontCartPage />) },
];
