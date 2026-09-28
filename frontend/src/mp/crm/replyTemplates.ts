// Reply templates for CRM dialogs: the team's saved ones plus the built-in fallbacks.
import { useMemo } from 'react';
import { DEFAULT_REPLY_TEMPLATES, fillTemplate, useTemplates } from '../templates';
import { firstName, reviewLinkFor } from './crmData';
import type { Cart } from '../types';

export interface ReplyTemplate {
  key: string;
  title: string;
  body: string;
  category?: string;
}

/** The user's reply templates (shared + own), then any built-in one not overridden by title. */
export function useReplyTemplates(uid: string | undefined): ReplyTemplate[] {
  const saved = useTemplates('reply', uid);
  return useMemo(() => {
    const list: ReplyTemplate[] = saved.map((t) => ({ key: t.id, title: t.title, body: t.body, category: t.category }));
    for (const d of DEFAULT_REPLY_TEMPLATES) {
      if (!list.some((t) => t.title.toLowerCase() === d.title.toLowerCase())) list.push({ key: `default:${d.title}`, ...d });
    }
    return list;
  }, [saved]);
}

/** The "Review request" template (by category or title). */
export const reviewTemplate = (list: ReplyTemplate[]): ReplyTemplate | undefined =>
  list.find((t) => t.category === 'review') || list.find((t) => /review/i.test(t.title));

/** Fills a template for a contact; {reviewLink} uses `locationId` when there is no cart. First name only. */
export function fillFor(body: string, opts: { cart?: Cart | null; name?: string; phone?: string; link?: string; locationId?: string }): string {
  let b = body;
  if (!opts.cart && opts.locationId) b = b.replace(/\{reviewLink\}/g, reviewLinkFor(opts.locationId));
  return fillTemplate(b, { cart: opts.cart || undefined, name: opts.name ? firstName(opts.name) : '', phone: opts.phone, link: opts.link });
}
