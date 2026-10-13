import { lazy, type ReactNode } from 'react';
import { SignedInSuspense } from '../../ui/PageSuspense';

const HelpCenter = lazy(() => import('./HelpCenter'));
const OnboardingWizard = lazy(() => import('../../ui/onboarding/OnboardingWizard'));

const page = (el: ReactNode) => <SignedInSuspense>{el}</SignedInSuspense>;

/** Pages this area adds under the signed-in app (wrapped in the auth guard by mp/routes.tsx). Loaded on demand. */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/help', element: page(<HelpCenter />) },
  { path: '/mp/welcome', element: page(<OnboardingWizard />) },
];
