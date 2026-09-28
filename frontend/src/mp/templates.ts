import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS, DEALERSHIP_BY_ID, locationName } from './constants';
import { cartTitle } from './cartLogic';
import type { Cart } from './types';
import type { TextTemplate } from './growthTypes';

export interface TemplateValues {
  cart?: Cart;
  name?: string;
  phone?: string;
  link?: string;
  storeName?: string;
}

/** Fills {year} {make} {model} {color} {price} {location} {phone} {name} {storeName} {link} {title} {reviewLink}. */
export function fillTemplate(body: string, v: TemplateValues): string {
  const c = v.cart;
  const store = c ? DEALERSHIP_BY_ID[c.locationId] : undefined;
  const values: Record<string, string> = {
    year: c?.year || '',
    make: c?.make || '',
    model: c?.model || '',
    color: c?.color || '',
    price: c && c.price > 0 ? `$${c.price.toLocaleString('en-US')}` : '',
    location: c ? locationName(c.locationId) : '',
    title: c ? cartTitle(c) : '',
    phone: v.phone || store?.phone || '',
    name: v.name || '',
    storeName: v.storeName || (store ? `TIGON ${store.name}` : 'TIGON Golf Carts'),
    link: v.link || '',
    reviewLink: store?.review || DEALERSHIP_BY_ID.T0?.review || '',
  };
  return body.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m)).replace(/[ \t]+\n/g, '\n').trim();
}

/** Live list of templates of one scope (shared + own). */
export function useTemplates(scope: TextTemplate['scope'], uid: string | undefined): TextTemplate[] {
  const [list, setList] = useState<TextTemplate[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(db, COLLECTIONS.templates),
      (snap) =>
        setList(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as TextTemplate)
            .filter((t) => t.scope === scope && (t.shared || t.createdBy === uid))
            .sort((a, b) => a.title.localeCompare(b.title)),
        ),
      () => setList([]),
    );
  }, [scope, uid]);
  return list;
}

/** Built-in reply templates offered until the team saves its own. */
export const DEFAULT_REPLY_TEMPLATES: Array<Pick<TextTemplate, 'title' | 'body' | 'category'>> = [
  { title: 'Still available', category: 'availability', body: 'Hi {name}! Yes, the {title} is still available at {price}. Want to come see it? We are at {storeName}, {location}. Call or text {phone}.' },
  { title: 'Price / financing', category: 'price', body: 'Hi {name}, the {year} {make} {model} is {price}. We offer financing and can deliver. Want me to send details? {link}' },
  { title: 'Pickup / delivery', category: 'pickup', body: 'Hi {name}, you can pick it up at {storeName} ({location}) or we can deliver. What works best for you?' },
  { title: 'Follow-up', category: 'follow-up', body: 'Hi {name}, just checking in on the {title}. Any questions I can answer? {phone}' },
  { title: 'Review request', category: 'review', body: 'Thanks for choosing {storeName}, {name}! If you have a minute, a review would mean a lot to us: {reviewLink}' },
];
