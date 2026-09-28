/** Webhook Flows sidebar entries (DashboardLayout → "WEBHOOK FLOWS"). `admin` = admins only. */
export interface WhNavItem { label: string; path: string; admin?: boolean }

export const WH_NAV: WhNavItem[] = [
  { label: 'Overview', path: '/wh' },
  { label: 'Add website', path: '/wh/new' },
  { label: 'Websites', path: '/wh/websites' },
  { label: 'Webhooks', path: '/wh/webhooks' },
  { label: 'Flows', path: '/wh/flows' },
  { label: 'Submissions', path: '/wh/submissions' },
  { label: 'Email templates', path: '/wh/templates' },
  { label: 'Settings', path: '/wh/settings', admin: true },
];

/** Which sidebar entry a URL belongs to ('' = none). Dead letters live under Submissions. */
export function activeWhPath(pathname: string): string {
  const p = pathname.replace(/\/+$/, '');
  if (p === '/wh') return '/wh';
  if (p.startsWith('/wh/dead')) return '/wh/submissions';
  let best = '';
  for (const { path } of WH_NAV) if (path !== '/wh' && (p === path || p.startsWith(`${path}/`)) && path.length > best.length) best = path;
  return best;
}
