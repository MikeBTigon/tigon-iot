import { lazy, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { SignedInSuspense } from '../ui/PageSuspense';

// Website forms (Webhook Flows) pages load on demand.
const WhOverview = lazy(() => import('./pages/WhOverview'));
const WhAddWebsite = lazy(() => import('./pages/WhAddWebsite'));
const WhWebsites = lazy(() => import('./pages/WhWebsites'));
const WhWebsiteDetail = lazy(() => import('./pages/WhWebsiteDetail'));
const WhWebhooks = lazy(() => import('./pages/WhWebhooks'));
const WhWebhookDetail = lazy(() => import('./pages/WhWebhookDetail'));
const WhFlows = lazy(() => import('./pages/WhFlows'));
const WhFlowBuilder = lazy(() => import('./pages/WhFlowBuilder'));
const WhSubmissions = lazy(() => import('./pages/WhSubmissions'));
const WhSubmissionDetail = lazy(() => import('./pages/WhSubmissionDetail'));
const WhDeadLetters = lazy(() => import('./pages/WhDeadLetters'));
const WhTemplates = lazy(() => import('./pages/WhTemplates'));
const WhTemplateEditor = lazy(() => import('./pages/WhTemplateEditor'));
const WhSettings = lazy(() => import('./pages/WhSettings'));

const page = (el: ReactNode) => <SignedInSuspense>{el}</SignedInSuspense>;

/** Webhook Flows pages (wrapped in the auth guard by mp/routes.tsx). */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/wh', element: page(<WhOverview />) },
  // "Problems" is a tab of System health now.
  { path: '/wh/triage', element: <Navigate to="/mp/status?tab=forms" replace /> },
  { path: '/wh/new', element: page(<WhAddWebsite />) },
  { path: '/wh/websites', element: page(<WhWebsites />) },
  { path: '/wh/websites/:id', element: page(<WhWebsiteDetail />) },
  { path: '/wh/webhooks', element: page(<WhWebhooks />) },
  { path: '/wh/webhooks/:id', element: page(<WhWebhookDetail />) },
  { path: '/wh/flows', element: page(<WhFlows />) },
  { path: '/wh/flows/:id', element: page(<WhFlowBuilder />) },
  { path: '/wh/submissions', element: page(<WhSubmissions key="all" />) },
  { path: '/wh/submissions/leads', element: page(<WhSubmissions key="leads" path="/wh/submissions/leads" />) },
  { path: '/wh/submissions/spam-blocked', element: page(<WhSubmissions key="spam" path="/wh/submissions/spam-blocked" />) },
  { path: '/wh/submissions/duplicates', element: page(<WhSubmissions key="dup" path="/wh/submissions/duplicates" />) },
  { path: '/wh/submissions/failed-steps', element: page(<WhDeadLetters />) },
  { path: '/wh/submissions/:id', element: page(<WhSubmissionDetail />) },
  { path: '/wh/dead', element: page(<WhDeadLetters />) },
  { path: '/wh/templates', element: page(<WhTemplates />) },
  { path: '/wh/templates/:id', element: page(<WhTemplateEditor />) },
  { path: '/wh/settings', element: page(<WhSettings />) },
];
