// Tracked short links (mp_links) + UTM targets + platform captions.
// Clicks are counted server-side by the mpLink function (functions/src/mpShare.ts).
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { currentDeviceId } from '../../native/deviceSession';
import { cartTitle, locationCity } from '../cartLogic';
import { COLLECTIONS, DEALERSHIP_BY_ID, PUBLIC_ORIGIN, shortLinkUrl } from '../constants';
import type { Cart, Listing, MpCart } from '../types';
import type { SharePlatform, ShortLink, Storefront } from '../growthTypes';

/** mp_links doc as written by the app (ShortLink + a display title so sold carts still read well). */
export interface ShortLinkDoc extends ShortLink {
  cartTitle?: string;
}

export const PLATFORM_LABEL: Record<SharePlatform, string> = {
  facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', tiktok: 'TikTok', x: 'X',
  sms: 'Text (SMS)', email: 'Email', qr: 'QR code', storefront: 'Storefront', other: 'Other',
};

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Random 7-character base62 code. */
export function randomCode(len = 7): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => BASE62[b % 62]).join('');
}

// The signed-in user's published storefront slug (links point at it), cached per session.
let slugCache: { uid: string; slug: string } | null = null;

/** Finds the user's own storefront (one per user). */
export async function findMyStorefront(uid: string): Promise<Storefront | null> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.storefronts), where('userId', '==', uid), limit(1)));
  const d = snap.docs[0];
  return d ? ({ ...(d.data() as Omit<Storefront, 'id'>), id: d.id }) : null;
}

async function myStorefrontSlug(uid: string): Promise<string> {
  if (slugCache?.uid === uid) return slugCache.slug;
  let slug = 'tigon';
  try {
    const sf = await findMyStorefront(uid);
    if (sf?.published) slug = sf.id;
  } catch {
    /* fall back to the built-in storefront */
  }
  slugCache = { uid, slug };
  return slug;
}

/** Call after saving a storefront so new links use the right slug. */
export function clearStorefrontSlugCache() {
  slugCache = null;
  linkCache.clear();
}

/** Storefront cart URL with UTM parameters. */
export function trackedTarget(slug: string, cartDocId: string, p: {
  platform: SharePlatform; campaign: string; uid: string; deviceId: string; variant?: string;
}): string {
  const q = new URLSearchParams({
    utm_source: p.platform,
    utm_medium: 'social',
    utm_campaign: p.campaign,
    utm_content: `${p.uid}_${p.deviceId}`,
  });
  if (p.variant) q.set('utm_term', p.variant);
  return `${PUBLIC_ORIGIN}/s/${slug}${cartDocId ? `/${encodeURIComponent(cartDocId)}` : ''}?${q.toString()}`;
}

export interface CreateLinkOptions {
  /** The cart to link to; omit for a storefront link. */
  cart?: MpCart | null;
  platform: SharePlatform;
  campaign: string;
  variant?: 'A' | 'B';
  variantLabel?: string;
  abTestId?: string;
  /** Override the storefront slug (default: your published storefront, else 'tigon'). */
  slug?: string;
}

/** Creates mp_links/{code} for the signed-in user and returns the short URL. */
export async function createShortLink(opts: CreateLinkOptions): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to create share links.');
  const deviceId = currentDeviceId();
  const slug = opts.slug || (await myStorefrontSlug(uid));
  const cartId = opts.cart?.docId || '';
  const data: Record<string, unknown> = {
    cartId,
    cartTitle: opts.cart ? `${opts.cart.year ? opts.cart.year + ' ' : ''}${cartTitle(opts.cart)}` : `Storefront /s/${slug}`,
    target: trackedTarget(slug, cartId, { platform: opts.platform, campaign: opts.campaign, uid, deviceId, variant: opts.variant }),
    platform: opts.platform,
    campaign: opts.campaign,
    userId: uid,
    deviceId,
    variant: opts.variant,
    variantLabel: opts.variantLabel,
    abTestId: opts.abTestId,
    clicks: 0,
    createdAt: Date.now(),
  };
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const ref = doc(db, COLLECTIONS.links, code);
    if ((await getDoc(ref)).exists()) continue;
    try {
      await setDoc(ref, clean);
      return shortLinkUrl(code);
    } catch (e) {
      // A collision turns the create into a (denied) update; retry with a new code.
      if (attempt === 4) throw e;
    }
  }
  throw new Error('Could not create a share link. Try again.');
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

const MAX_LEN: Partial<Record<SharePlatform, number>> = { x: 280, sms: 320, whatsapp: 900, email: 2000, instagram: 2000, tiktok: 2000 };

/** Store phone for a cart (company number when the cart has no store). */
export function storePhone(cart: Cart): string {
  return DEALERSHIP_BY_ID[cart.locationId]?.phone || DEALERSHIP_BY_ID.T0.phone;
}

function truncateWords(s: string, max: number): string {
  if (max <= 0) return '';
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(0, max - 1));
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:-]+$/, '')}…`;
}

function hashtags(cart: Cart): string {
  const cityTag = locationCity(cart.locationId).replace(/[^A-Za-z]/g, '');
  const tags = ['#golfcart', '#golfcarts', '#tigongolfcarts', cart.make && `#${cart.make.replace(/[^A-Za-z0-9]/g, '')}`, cityTag && `#${cityTag}`, cart.isUsed ? '#usedgolfcart' : '#newgolfcart'];
  return tags.filter(Boolean).join(' ');
}

export interface Caption {
  /** Headline (subject line for email). */
  title: string;
  text: string;
}

/** Platform-appropriate caption: title + short description + price + phone + link. */
export function buildCaption(listing: Listing, cart: Cart, link: string, platform: SharePlatform): Caption {
  const price = cart.price > 0 ? `$${cart.price.toLocaleString('en-US')}` : '';
  const title = [listing.title1, listing.title2].filter(Boolean).join(' – ');
  const phone = storePhone(cart);
  const desc = listing.description.replace(/\n{2,}/g, '\n').trim();
  if (platform === 'x') {
    const head = `${title}${price ? ` ${price}` : ''}`;
    const tail = `\n${link}`;
    const budget = 280 - head.length - tail.length - 2;
    const short = budget > 20 ? `\n${truncateWords(desc.replace(/\n/g, ' '), budget)}` : '';
    return { title, text: truncateWords(head, 280 - tail.length) + short + tail };
  }
  const tags = platform === 'instagram' || platform === 'tiktok' ? `\n\n${hashtags(cart)}` : '';
  const callLine = `Call/text ${phone}`;
  const linkLine = platform === 'instagram' || platform === 'tiktok' ? `Details: ${link} (link in bio)` : link;
  const fixed = [title, price, callLine, linkLine].join('\n').length + tags.length + 4;
  const max = MAX_LEN[platform] ?? 1200;
  const shortDesc = truncateWords(platform === 'sms' ? desc.replace(/\n/g, ' ') : desc, Math.min(max - fixed, platform === 'sms' ? 140 : 900));
  const text = [title, price, shortDesc, `${callLine}\n${linkLine}`].filter(Boolean).join('\n\n') + tags;
  return { title, text };
}

// Session cache so re-sharing the same cart to the same platform reuses one link.
const linkCache = new Map<string, Promise<string>>();

/** createShortLink, reused per cart + platform + campaign for this session (failed attempts are retried). */
export function getOrCreateLink(opts: CreateLinkOptions): Promise<string> {
  const key = [auth.currentUser?.uid, opts.cart?.docId || '', opts.platform, opts.campaign, opts.slug || '', opts.variant || '', opts.abTestId || ''].join('|');
  let p = linkCache.get(key);
  if (!p) {
    p = createShortLink(opts);
    p.catch(() => linkCache.delete(key));
    linkCache.set(key, p);
  }
  return p;
}
