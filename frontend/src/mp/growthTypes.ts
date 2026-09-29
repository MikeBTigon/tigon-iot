// Shared types for the growth release (listings, sharing, CRM, team, admin).
// Every track builds against these — change them only in coordination.

// ---------------------------------------------------------------------------
// Listings created in the app (not from DMS): stored in mp_carts with a
// DMS-shaped `payload` so every existing screen works unchanged.
// ---------------------------------------------------------------------------

/** mp_carts.source values. DMS sync only ever removes 'dms-api' / legacy carts. */
export type CartSource = 'dms-api' | 'manual' | `import:${string}`;

export interface ManualCartFields {
  source: 'manual' | `import:${string}`;
  createdBy: string;
  createdAt: number;
  /** Full-size photo URLs (Firebase Storage download URLs or external https). */
  photoUrls?: string[];
  /** Set by "mark as sold" (DMS carts are hidden locally until DMS catches up). */
  soldLocally?: boolean;
}

/** Firestore: mp_templates. Reusable text for listings or buyer replies. */
export interface TextTemplate {
  id: string;
  scope: 'listing' | 'reply';
  title: string;
  /** Placeholders: {year} {make} {model} {color} {price} {location} {phone} {name} {storeName} {link} */
  body: string;
  category?: string;
  shared: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Integrations (bulk import from other systems)
// ---------------------------------------------------------------------------

export type IntegrationKind = 'woocommerce' | 'shopify' | 'json-feed' | 'csv-url';

/** Firestore: mp_integrations (admins). Credentials live in mp_integration_secrets/{id} (server-only reads). */
export interface Integration {
  id: string;
  kind: IntegrationKind;
  name: string;
  baseUrl: string;
  enabled: boolean;
  /** T-location assigned to imported items when the source has none. */
  locationId: string;
  /** For json-feed / csv-url: field mapping sourceField → cart field. */
  mapping?: Record<string, string>;
  lastRunAt?: number;
  lastResult?: string;
  /** When credentials were last saved (the secrets themselves are never readable). */
  credentialsSetAt?: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Sharing, links, storefront
// ---------------------------------------------------------------------------

export type SharePlatform =
  | 'facebook' | 'instagram' | 'whatsapp' | 'tiktok' | 'x' | 'sms' | 'email' | 'qr' | 'storefront' | 'other';

/** Firestore: mp_links/{code}. A tracked short link: https://tigon-iot.web.app/l/{code} */
export interface ShortLink {
  id: string;
  cartId: string;
  /** Where the click goes (storefront cart page by default). */
  target: string;
  platform: SharePlatform;
  campaign: string;
  userId: string;
  deviceId: string;
  /** A/B test: which variant this link carries. */
  variant?: 'A' | 'B';
  variantLabel?: string;
  abTestId?: string;
  /** Cart title at share time (readable after the cart sells). */
  cartTitle?: string;
  clicks: number;
  lastClickAt?: number;
  createdAt: number;
}

/** Firestore: mp_clicks (written only by the mpLink function). */
export interface Click {
  id?: string;
  code: string;
  cartId: string;
  userId: string;
  deviceId: string;
  platform: SharePlatform;
  variant?: 'A' | 'B';
  abTestId?: string;
  ts: number;
  referrer?: string;
  userAgent?: string;
}

/** Firestore: mp_storefronts/{slug}. Public page at /s/{slug}. */
export interface Storefront {
  id: string;
  userId: string;
  title: string;
  tagline: string;
  phone: string;
  /** Show in-stock carts from these T-locations (empty = all). */
  locationIds: string[];
  /** Pinned carts shown first. */
  pinnedCartIds: string[];
  showNew: boolean;
  showUsed: boolean;
  published: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export type LeadChannel = 'facebook' | 'instagram' | 'whatsapp' | 'sms' | 'phone' | 'email' | 'walk-in' | 'website' | 'dba_website' | 'other';
export type LeadStatus = 'new' | 'talking' | 'sold' | 'lost';

/** Firestore: mp_leads. */
export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  channel: LeadChannel;
  status: LeadStatus;
  cartId?: string;
  cartTitle?: string;
  ownerUid: string;
  deviceId?: string;
  /** Short link / IoT notification this lead came from (attribution). */
  linkCode?: string;
  notificationId?: string;
  customerId?: string;
  notes: string;
  followUpAt?: number;
  lastContactAt?: number;
  soldPrice?: number;
  soldAt?: number;
  reviewRequestedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Firestore: mp_customers. Only contact people who opted in for that channel. */
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  consentSms: boolean;
  consentWhatsapp: boolean;
  consentEmail: boolean;
  /** When/how consent was recorded (e.g. "verbal at Hatfield store", "web form"). */
  consentAt?: number;
  consentSource?: string;
  tags: string[];
  locationId: string;
  lastPurchaseAt?: number;
  reviewRequestedAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

/** Firestore: mp_goals/{userId}_{periodKey}. periodKey like 2026-W40 or 2026-09. */
export interface Goal {
  id: string;
  userId: string;
  period: 'week' | 'month';
  periodKey: string;
  posts: number;
  leads: number;
  sales: number;
  setBy: string;
  updatedAt: number;
}

/** Firestore: mp_assets (brand library; files in Storage at mp_assets/{id}-{name}). */
export interface BrandAsset {
  id: string;
  name: string;
  path: string;
  url: string;
  contentType: string;
  size: number;
  tags: string[];
  uploadedBy: string;
  createdAt: number;
}

/** Firestore: mp_settings/general (admins write, members read). */
export interface MpSettings {
  /** Members' queue items wait for manager approval before going to phones. */
  requireApproval: boolean;
  /** Company phone shown on storefronts/flyers when a user has none. */
  defaultPhone?: string;
  /** Watermark/logo URL for the photo studio and post templates. */
  logoUrl?: string;
  /** Days after posting before a relist reminder. */
  relistAfterDays: number;
}

// ---------------------------------------------------------------------------
// User preferences (stored on mp_users/{uid}.prefs)
// ---------------------------------------------------------------------------

export type Language = 'en' | 'es' | 'fr' | 'ht';

export interface UserPrefs {
  language?: Language;
  theme?: 'light' | 'dark' | 'system';
  largeText?: boolean;
  onboardingDone?: boolean;
}
