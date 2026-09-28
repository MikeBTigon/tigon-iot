/** Helpers for the MP Assistant navigation (built from mp/navRegistry). */
import { MP_NAV, canSee, type NavGroup, type NavItem } from '../mp/navRegistry';

/** Pages that aren't in the menu but belong to a menu entry (for highlighting). */
const ALIASES: Array<[prefix: string, navPath: string]> = [
  ['/mp/post/', '/mp/queue'],
  ['/mp/prepare/', '/mp'],
  ['/mp/cart/', '/mp/browse'],
  ['/mp/welcome', '/mp/help'],
];

const ALL_PATHS = MP_NAV.flatMap((g) => g.items.map((i) => i.path));

/** The menu path that should be highlighted for a URL path, or '' when none. */
export function activeNavPath(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/mp') return '/mp';
  let best = '';
  for (const path of ALL_PATHS) {
    if (path === '/mp') continue;
    if ((p === path || p.startsWith(`${path}/`)) && path.length > best.length) best = path;
  }
  if (best) return best;
  const alias = ALIASES.find(([prefix]) => p.startsWith(prefix));
  return alias ? alias[1] : '';
}

/** Menu groups with only the items this role may open (empty groups removed). */
export function visibleNav(role: string | undefined): NavGroup[] {
  return MP_NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => canSee(role, i.min)) }))
    .filter((g) => g.items.length > 0);
}

/** Every visible nav item, flat. */
export const visibleNavItems = (role: string | undefined): NavItem[] => visibleNav(role).flatMap((g) => g.items);

/** The group a menu path belongs to. */
export const groupOf = (path: string): NavGroup | undefined => MP_NAV.find((g) => g.items.some((i) => i.path === path));
