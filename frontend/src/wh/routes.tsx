import type { ReactNode } from 'react';
import WhOverview from './pages/WhOverview';
import WhAddWebsite from './pages/WhAddWebsite';
import WhWebsites from './pages/WhWebsites';
import WhWebsiteDetail from './pages/WhWebsiteDetail';
import WhWebhooks from './pages/WhWebhooks';
import WhWebhookDetail from './pages/WhWebhookDetail';
import WhFlows from './pages/WhFlows';
import WhFlowBuilder from './pages/WhFlowBuilder';
import WhSubmissions from './pages/WhSubmissions';
import WhSubmissionDetail from './pages/WhSubmissionDetail';
import WhDeadLetters from './pages/WhDeadLetters';
import WhTemplates from './pages/WhTemplates';
import WhTemplateEditor from './pages/WhTemplateEditor';
import WhSettings from './pages/WhSettings';
import WhTriage from './pages/WhTriage';

/** Webhook Flows pages (wrapped in the auth guard by mp/routes.tsx). */
export const ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/wh', element: <WhOverview /> },
  { path: '/wh/triage', element: <WhTriage /> },
  { path: '/wh/new', element: <WhAddWebsite /> },
  { path: '/wh/websites', element: <WhWebsites /> },
  { path: '/wh/websites/:id', element: <WhWebsiteDetail /> },
  { path: '/wh/webhooks', element: <WhWebhooks /> },
  { path: '/wh/webhooks/:id', element: <WhWebhookDetail /> },
  { path: '/wh/flows', element: <WhFlows /> },
  { path: '/wh/flows/:id', element: <WhFlowBuilder /> },
  { path: '/wh/submissions', element: <WhSubmissions /> },
  { path: '/wh/submissions/:id', element: <WhSubmissionDetail /> },
  { path: '/wh/dead', element: <WhDeadLetters /> },
  { path: '/wh/templates', element: <WhTemplates /> },
  { path: '/wh/templates/:id', element: <WhTemplateEditor /> },
  { path: '/wh/settings', element: <WhSettings /> },
];
