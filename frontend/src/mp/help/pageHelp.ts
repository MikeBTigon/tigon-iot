// Which help article belongs to which page (the "?" in the page header opens it).
// Owned by the help/translation track; the layout reads it through pageHelpFor().
import type { HelpArticleId } from './articles';

/** Longest matching path prefix wins. */
export const PAGE_HELP: Array<{ path: string; article: HelpArticleId }> = [
  { path: '/mp', article: 'post-3-taps' },
  { path: '/mp/leads', article: 'leads' },
];

export function pageHelpFor(pathname: string): HelpArticleId | null {
  let best: { path: string; article: HelpArticleId } | null = null;
  for (const e of PAGE_HELP) {
    if ((pathname === e.path || pathname.startsWith(`${e.path}/`)) && (!best || e.path.length > best.path.length)) best = e;
  }
  return best?.article ?? null;
}
