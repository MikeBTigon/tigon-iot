import type { ReactNode } from 'react';
import HelpCenter from './HelpCenter';
import OnboardingWizard from '../../ui/onboarding/OnboardingWizard';

/** Pages this area adds under the signed-in app (wrapped in the auth guard by mp/routes.tsx). */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/mp/help', element: <HelpCenter /> },
  { path: '/mp/welcome', element: <OnboardingWizard /> },
];
