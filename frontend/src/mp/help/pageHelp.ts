// Which help article belongs to which page (the "?" in the page header opens it).
// Owned by the help/translation track; the layout reads it through pageHelpFor().
import type { HelpArticleId } from './articles';

/** Longest matching path prefix wins (so '/mp' is the fallback for every MP Assistant page). */
export const PAGE_HELP: Array<{ path: string; article: HelpArticleId }> = [
  // IoT dashboard & account
  { path: '/dashboard', article: 'phones-texting' },
  { path: '/devices', article: 'pair-phone' },
  { path: '/download', article: 'pair-phone' },
  { path: '/users', article: 'users-approvals' },
  { path: '/requests', article: 'troubleshooting' },
  { path: '/settings', article: 'settings' },

  // MP Assistant — Sell
  { path: '/mp', article: 'post-3-taps' },
  { path: '/mp/find', article: 'find-cart' },
  { path: '/mp/browse', article: 'find-cart' },
  { path: '/mp/locations', article: 'find-cart' },
  { path: '/mp/cart', article: 'post-3-taps' },
  { path: '/mp/prepare', article: 'post-3-taps' },
  { path: '/mp/new', article: 'snap-to-list' },
  { path: '/mp/finance', article: 'financing' },
  { path: '/mp/flyer', article: 'share-kit' },

  // Post & share
  { path: '/mp/queue', article: 'auto-post' },
  { path: '/mp/post', article: 'post-3-taps' },
  { path: '/mp/calendar', article: 'auto-post' },
  { path: '/mp/storefront', article: 'share-kit' },
  { path: '/mp/links', article: 'share-kit' },
  { path: '/mp/share', article: 'share-kit' },
  { path: '/mp/templates', article: 'share-kit' },

  // Sell more
  { path: '/mp/today', article: 'today' },
  { path: '/mp/appointments', article: 'appointments' },
  { path: '/mp/texts', article: 'texts' },
  { path: '/mp/quotes', article: 'quotes' },
  { path: '/mp/trade-ins', article: 'trade-ins' },
  { path: '/mp/prequal', article: 'prequal' },
  { path: '/mp/aged', article: 'aged' },
  { path: '/mp/referrals', article: 'referrals' },
  { path: '/mp/funnel', article: 'funnel' },
  { path: '/mp/reviews', article: 'reviews' },
  { path: '/mp/sales-settings', article: 'settings' },

  // Customers
  { path: '/mp/leads', article: 'leads' },
  { path: '/mp/customers', article: 'customers' },
  { path: '/mp/insights', article: 'funnel' },
  // New pages from the insights track (mp/insights/routes.tsx)
  { path: '/mp/customer', article: 'customer-history' },
  { path: '/mp/live', article: 'live-board' },
  { path: '/mp/inbox', article: 'inbox' },
  { path: '/mp/credit-app', article: 'credit-apps' },

  // Team & admin
  { path: '/mp/analytics', article: 'funnel' },
  { path: '/mp/report', article: 'funnel' },
  { path: '/mp/team', article: 'today' },
  { path: '/mp/profiles', article: 'post-3-taps' },
  { path: '/mp/assets', article: 'share-kit' },
  { path: '/mp/accounts', article: 'users-approvals' },
  { path: '/mp/import', article: 'snap-to-list' },
  { path: '/mp/status', article: 'troubleshooting' },
  { path: '/mp/exports', article: 'settings' },
  { path: '/mp/settings', article: 'settings' },
  { path: '/mp/welcome', article: 'pair-phone' },

  // Webhook Flows (website forms)
  { path: '/wh', article: 'website-forms' },
  { path: '/wh/settings', article: 'google-sheets' },
];

export function pageHelpFor(pathname: string): HelpArticleId | null {
  let best: { path: string; article: HelpArticleId } | null = null;
  for (const e of PAGE_HELP) {
    if ((pathname === e.path || pathname.startsWith(`${e.path}/`)) && (!best || e.path.length > best.path.length)) best = e;
  }
  return best?.article ?? null;
}
