import type { ReactNode } from 'react';

/** Pages this area adds under the signed-in app (wrapped in the auth guard by mp/routes.tsx). */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [];

/** Public pages (no sign-in), e.g. storefronts at /s/:slug. */
export const PUBLIC_ROUTES: Array<{ path: string; element: ReactNode }> = [];
