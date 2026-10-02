/** The submission lists that have their own URL (overview boxes open these). */
export interface SubmissionView { path: string; label: string; status: string; title: string; subtitle: string }

export const SUBMISSIONS_PATH = '/wh/submissions';
export const FAILED_STEPS_PATH = '/wh/submissions/failed-steps';

export const SUBMISSION_VIEWS: SubmissionView[] = [
  { path: SUBMISSIONS_PATH, label: 'All submissions', status: '', title: 'Submissions', subtitle: 'Every lead received from your websites' },
  { path: '/wh/submissions/leads', label: 'Leads', status: 'leads', title: 'Leads', subtitle: 'Every real lead (spam left out)' },
  { path: '/wh/submissions/spam-blocked', label: 'Spam blocked', status: 'spam', title: 'Spam blocked', subtitle: 'Every submission that was blocked as spam' },
  { path: '/wh/submissions/duplicates', label: 'Duplicates', status: 'duplicate', title: 'Duplicates', subtitle: 'Every submission that was a repeat of an earlier lead' },
  { path: FAILED_STEPS_PATH, label: 'Failed steps', status: '', title: 'Failed steps', subtitle: '' },
];

export const viewByPath = (path: string) => SUBMISSION_VIEWS.find((v) => v.path === path) || SUBMISSION_VIEWS[0];
