import type { UserPrefs } from './growthTypes';

/** admin: everything · manager: team devices, queue, analytics · sales (shown as "Member"): own work. */
export type MpRole = 'admin' | 'manager' | 'sales';

export interface MpProfile {
  uid: string;
  email: string;
  name: string;
  role: MpRole;
  legacyId?: string;
  /** Display preferences (language, theme, large text, onboarding). */
  prefs?: UserPrefs;
}

export interface PostedAccountEntry {
  by: string;
  ts: number;
}

/** Firestore document shape for `mp_carts`. */
export interface MpCartDoc {
  payload: string;
  savedAt: number;
  dmsId: string;
  serial: string;
  locationId: string;
  isUsed: boolean;
  postedBy?: Record<string, number>;
  postedAccounts?: Record<string, PostedAccountEntry>;
  source?: string;
  createdBy?: string;
  soldLocally?: boolean;
}

export interface MpAccount {
  id: string;
  name: string;
  group: string;
  owner: string;
  order?: number;
}

/** Clean cart mapped from raw DMS JSON. */
export interface Cart {
  id: string;
  dmsId: string;
  make: string;
  model: string;
  year: string;
  color: string;
  seatColor: string;
  driveTrain: string;
  tireRimSize: string;
  tireType: string;
  hasSoundSystem: boolean;
  isLifted: boolean;
  hasHitch: boolean;
  hasExtendedTop: boolean;
  passengers: number;
  isElectric: boolean;
  isUsed: boolean;
  isStreetLegal: boolean;
  batteryType: string;
  packVoltage: string;
  batteryBrand: string;
  batteryYear: string;
  engineMake: string;
  locationId: string;
  price: number;
  cartWarranty: string;
  batteryWarranty: string;
  serial: string;
  vin: string;
  invoice: string;
  status: string;
  isDraft: boolean;
  isRFS: boolean;
  photos: string[];
  photoSource: 'public' | 'internal' | 'default' | 'none';
  /** False when DMS marks the cart sold (isInStock: false). */
  inStock: boolean;
  /** Monroney window sticker URL, when DMS has one. */
  windowSticker: string;
  flaggedDelete: boolean;
}

/** A cart as held in the app: mapped cart + tracking metadata. */
export interface MpCart extends Cart {
  docId: string;
  savedAt: number;
  postedBy: Record<string, number>;
  postedAccounts: Record<string, PostedAccountEntry>;
  /** 'dms-api' (synced), 'manual' (created in the app) or 'import:<integrationId>'. */
  source?: string;
  createdBy?: string;
  soldLocally?: boolean;
}

export interface MpSyncStatus {
  ok?: boolean;
  trigger?: string;
  startedAt?: number;
  finishedAt?: number;
  fetched?: number;
  inStock?: number;
  written?: number;
  unchanged?: number;
  removedSold?: number;
  skippedDelete?: number;
  warning?: string;
  error?: string;
}

export type ListingFormat = 'list' | 'paragraph';

export interface Listing {
  title1: string;
  title2: string;
  description: string;
  format: ListingFormat;
}

// ---------------------------------------------------------------------------
// Devices (shared `devices` collection; phone-app docs have source 'tigon-iot-app')
// ---------------------------------------------------------------------------

export interface DeviceDoc {
  id: string;
  userId: string;
  deviceName: string;
  deviceType: 'master' | 'worker';
  /** IoT push alerts on (onNotificationCreate sends to active master devices). */
  isActive: boolean;
  fcmToken?: string;
  source?: 'tigon-iot-app' | string;
  platform?: 'ios' | 'android' | 'web' | string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
  installId?: string;
  /** Epoch ms of the last heartbeat (app open in foreground). */
  lastSeen?: number;
  status?: 'active' | 'revoked';
  pairedAt?: number;
  /** Phone number on the team (e.g. "0003") — not a telephone number. */
  deviceNumber?: string;
  /** Dealership location id (DEALERSHIPS, e.g. "T1"). */
  locationId?: string;
  /** Facebook account (mp_accounts) this phone posts with. */
  accountId?: string;
  accountName?: string;
}

// ---------------------------------------------------------------------------
// Posting queue (mp_queue)
// ---------------------------------------------------------------------------

export type QueueStatus = 'pending_approval' | 'queued' | 'sent' | 'opened' | 'posted' | 'failed' | 'cancelled';

export interface QueueItem {
  id: string;
  cartId: string;
  cartTitle: string;
  cartPrice: number;
  locationId: string;
  assignedUserId: string;
  /** Specific phone, or '' for any of the assigned user's phones. */
  deviceId: string;
  /** Facebook account to post on ('' = user picks). */
  accountId: string;
  accountName: string;
  /** Listing variation index 0-4. */
  variation: number;
  scheduledAt: number;
  status: QueueStatus;
  attempts: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
  openedAt?: number;
  postedAt?: number;
  lastError?: string;
  failAlertedAt?: number;
  approvedBy?: string;
  approvedAt?: number;
  rejectedReason?: string;
}

// ---------------------------------------------------------------------------
// Analytics (mp_events, mp_device_days)
// ---------------------------------------------------------------------------

export type MpEventType =
  | 'app_open'
  | 'listing_prepared'
  | 'photos_saved'
  | 'text_copied'
  | 'marketplace_opened'
  | 'post_marked'
  | 'post_failed'
  | 'queue_opened'
  | 'ai_listing'
  | 'listing_created'
  | 'share'
  | 'lead_created'
  | 'lead_sold'
  | 'error';

export interface MpEvent {
  id?: string;
  type: MpEventType;
  userId: string;
  /** Device doc id, or 'web' for the website. */
  deviceId: string;
  platform: string;
  ts: number;
  cartId?: string;
  queueId?: string;
  accountId?: string;
  message?: string;
}

/** Per-device per-day activity: mp_device_days/{deviceId}_{YYYYMMDD}. */
export interface DeviceDay {
  deviceId: string;
  userId: string;
  /** YYYY-MM-DD */
  date: string;
  activeMinutes: number;
}

// ---------------------------------------------------------------------------
// Alerts + audit
// ---------------------------------------------------------------------------

export interface MpAlert {
  id: string;
  kind: 'device_offline' | 'post_failed' | 'sync_failed';
  text: string;
  deviceId?: string;
  queueId?: string;
  userId?: string;
  createdAt: number;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
}

export interface AuditEntry {
  id?: string;
  actorUid: string;
  actorName: string;
  action: string;
  target: string;
  details?: string;
  ts: number;
}
