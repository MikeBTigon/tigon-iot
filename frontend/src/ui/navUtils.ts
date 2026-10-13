/** Helpers for the app menu (built from mp/navRegistry). */
import { MP_NAV, canSee, type NavGroup, type NavItem } from '../mp/navRegistry';

/** Pages that aren't in the menu but belong to a menu entry (for highlighting). */
const ALIASES: Array<[prefix: string, navPath: string]> = [
  ['/mp/post/', '/mp/queue'],
  ['/mp/prepare/', '/mp'],
  ['/mp/cart/', '/mp/browse'],
  ['/mp/share/', '/mp/browse'],
  ['/mp/flyer/', '/mp/browse'],
  ['/mp/profiles', '/users'],
  ['/mp/report', '/mp/exports'],
  ['/wh/dead', '/wh/submissions'],
];

const ALL_PATHS = MP_NAV.flatMap((g) => g.items.map((i) => i.path));

/** The menu path that should be highlighted for a URL path, or '' when none. */
export function activeNavPath(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/mp') return '/mp';
  if (p === '/wh') return '/wh';
  let best = '';
  for (const path of ALL_PATHS) {
    if (path === '/mp' || path === '/wh') continue;
    if ((p === path || p.startsWith(`${path}/`)) && path.length > best.length) best = path;
  }
  if (best) return best;
  const alias = ALIASES.find(([prefix]) => p === prefix || p.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
  return alias ? alias[1] : '';
}

/** Menu groups with only the items this role may open (hidden items and empty groups removed). */
export function visibleNav(role: string | undefined): NavGroup[] {
  return MP_NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.hidden && canSee(role, i.min)) }))
    .filter((g) => g.items.length > 0);
}

/** Every page this role may open, flat — hidden ones included (for search). */
export const visibleNavItems = (role: string | undefined): Array<NavItem & { group: NavGroup }> =>
  MP_NAV.flatMap((g) => g.items.filter((i) => canSee(role, i.min)).map((i) => ({ ...i, group: g })));

/** The group a menu path belongs to. */
export const groupOf = (path: string): NavGroup | undefined => MP_NAV.find((g) => g.items.some((i) => i.path === path));

/** A nav entry's translated label (English from the registry when the translation is missing). */
export const navLabel = (t: (key: string, fallback: string) => string, item: { key: string; label: string }) => t(item.key, item.label);
