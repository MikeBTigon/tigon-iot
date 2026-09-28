export type MpRole = 'admin' | 'sales';

export interface MpProfile {
  uid: string;
  email: string;
  name: string;
  role: MpRole;
  legacyId?: string;
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
