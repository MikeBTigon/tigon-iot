/**
 * MP Assistant navigation, grouped. Every page path is listed here once; each feature area
 * registers the page component in its own routes.tsx.
 * `min` = minimum role: 'sales' (everyone), 'manager', 'admin'.
 */
export type MinRole = 'sales' | 'manager' | 'admin';

export interface NavItem {
  label: string;
  path: string;
  min: MinRole;
  /** i18n key (Track 5). */
  key: string;
}

export interface NavGroup {
  label: string;
  key: string;
  items: NavItem[];
}

export const MP_NAV: NavGroup[] = [
  {
    label: 'Sell', key: 'nav.sell', items: [
      { label: 'Home', path: '/mp', min: 'sales', key: 'nav.home' },
      { label: 'Find a Cart', path: '/mp/find', min: 'sales', key: 'nav.find' },
      { label: 'Browse', path: '/mp/browse', min: 'sales', key: 'nav.browse' },
      { label: 'Locations', path: '/mp/locations', min: 'sales', key: 'nav.locations' },
      { label: 'New listing', path: '/mp/new', min: 'sales', key: 'nav.new' },
      { label: 'Financing', path: '/mp/finance', min: 'sales', key: 'nav.finance' },
    ],
  },
  {
    label: 'Post & share', key: 'nav.post', items: [
      { label: 'Queue', path: '/mp/queue', min: 'sales', key: 'nav.queue' },
      { label: 'Calendar', path: '/mp/calendar', min: 'sales', key: 'nav.calendar' },
      { label: 'Storefront', path: '/mp/storefront', min: 'sales', key: 'nav.storefront' },
      { label: 'Links & A/B', path: '/mp/links', min: 'sales', key: 'nav.links' },
      { label: 'Templates', path: '/mp/templates', min: 'sales', key: 'nav.templates' },
    ],
  },
  {
    label: 'Customers', key: 'nav.customers', items: [
      { label: 'Leads', path: '/mp/leads', min: 'sales', key: 'nav.leads' },
      { label: 'Customers', path: '/mp/customers', min: 'sales', key: 'nav.customerList' },
      { label: 'Insights', path: '/mp/insights', min: 'sales', key: 'nav.insights' },
    ],
  },
  {
    label: 'Team', key: 'nav.team', items: [
      { label: 'Analytics', path: '/mp/analytics', min: 'sales', key: 'nav.analytics' },
      { label: 'Goals & badges', path: '/mp/team', min: 'sales', key: 'nav.goals' },
      { label: 'Profiles', path: '/mp/profiles', min: 'sales', key: 'nav.profiles' },
      { label: 'Brand assets', path: '/mp/assets', min: 'sales', key: 'nav.assets' },
    ],
  },
  {
    label: 'Admin', key: 'nav.admin', items: [
      { label: 'Accounts', path: '/mp/accounts', min: 'admin', key: 'nav.accounts' },
      { label: 'Import', path: '/mp/import', min: 'manager', key: 'nav.import' },
      { label: 'Status', path: '/mp/status', min: 'manager', key: 'nav.status' },
      { label: 'Exports', path: '/mp/exports', min: 'manager', key: 'nav.exports' },
      { label: 'Settings', path: '/mp/settings', min: 'admin', key: 'nav.settings' },
    ],
  },
  {
    label: 'Help', key: 'nav.helpGroup', items: [
      { label: 'Help center', path: '/mp/help', min: 'sales', key: 'nav.help' },
    ],
  },
];

const RANK: Record<string, number> = { sales: 0, manager: 1, admin: 2 };
export const canSee = (role: string | undefined, min: MinRole) => (RANK[role || 'sales'] ?? 0) >= RANK[min];
