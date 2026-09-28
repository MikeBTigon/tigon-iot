// Shared configuration for the Tigon MP Assistant module.

// DMS production only.
export const DMS_API_BASE = 'https://api.tigondms.com/wp-website';
export const PHOTO_BASE = 'https://s3.amazonaws.com/prod.docs.s3/carts/';
export const WINDOW_STICKER_BASE = 'https://s3.amazonaws.com/prod.docs.s3/cart-window-stickers/';
export const DEFAULT_IMAGE_BASE = 'https://s3.amazonaws.com/prod.docs.s3/default-cart-web-images/';
export const PHOTO_WORKER = 'https://tigon-photos.michael-b-2da.workers.dev';
export const PAGE_SIZE = 50;
export const FETCH_BATCH = 200;

// Legacy standalone MP Assistant (public Firestore) — used for one-time migration.
export const LEGACY_PROJECT_ID = 'tigon-marketplace';
export const LEGACY_API_KEY = 'AIzaSyDReJcsB1I0-hQGK9kTJN4l4TO43Ow9b1Q';

export const COLLECTIONS = {
  carts: 'mp_carts',
  accounts: 'mp_accounts',
  users: 'mp_users',
  queue: 'mp_queue',
  events: 'mp_events',
  deviceDays: 'mp_device_days',
  alerts: 'mp_alerts',
  audit: 'mp_audit',
} as const;

/** A phone counts as online if its last heartbeat is newer than this. */
export const ONLINE_WINDOW_MS = 10 * 60 * 1000;
/** Heartbeat interval while the app is open. */
export const HEARTBEAT_MS = 5 * 60 * 1000;

export const ROLE_LABELS: Record<string, string> = { admin: 'Admin', manager: 'Manager', sales: 'Member' };

export const MARKETPLACE_CREATE_URL = 'https://www.facebook.com/marketplace/create/vehicle';

export const LOCATION_ORDER = [
  'T1', 'T2', 'T3', 'T3.5', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10',
  'T11', 'T12', 'T13', 'T14', 'T15', 'T0', 'Other',
];

export interface Dealership {
  id: string;
  name: string;
  /** "City, ST" — used in listings. */
  cityState: string;
  phone: string;
  address: string;
  lat?: number;
  lng?: number;
  maps: string;
  facebook: string;
  youtube: string;
  website: string;
  pinterest: string;
  review: string;
}

// Tigon dealership locations (source of truth for store info).
export const DEALERSHIPS: Dealership[] = [
  { id: 'T0', name: 'TIGON National', cityState: '', phone: '1-844-844-6638', address: 'National', maps: 'https://www.google.com/maps?cid=913687030872245288', facebook: 'https://www.facebook.com/Tigongolfcarts', youtube: 'https://www.youtube.com/@TigonGolfCarts', website: 'https://tigongolfcarts.com', pinterest: 'https://www.pinterest.com/tigongolfcarts/', review: 'https://g.page/r/CSiEBX-DEa4MEBM/review' },
  { id: 'T1', name: 'Hatfield PA', cityState: 'Hatfield, PA', phone: '215-595-8736', address: '2333 Bethlehem Pike, Hatfield, PA 19440', lat: 40.29839945958623, lng: -75.28308913039525, maps: 'https://www.google.com/maps?cid=8221925612164093496', facebook: 'https://www.facebook.com/TigonGolfCartsHatfield/', youtube: 'https://www.youtube.com/@TIGONGolfCartsHatfieldPA', website: 'https://tigongolfcarts.com/hatfield', pinterest: 'https://www.pinterest.com/tigongolfcarts/hatfield-pennsylvania/', review: 'https://g.page/r/CTgWulrIJRpyEBM/review' },
  { id: 'T2', name: 'Ocean View NJ', cityState: 'Ocean View, NJ', phone: '609-840-0404', address: '101 NJ-50, Ocean View, NJ 08230', lat: 39.22254797811702, lng: -74.70417212536503, maps: 'https://www.google.com/maps?cid=6446924254429489274', facebook: 'https://www.facebook.com/TigonGolfCartsOceanView/', youtube: 'https://www.youtube.com/@TIGONGolfCartsOceanViewNJ', website: 'https://tigongolfcarts.com/ocean-view', pinterest: 'https://www.pinterest.com/tigongolfcarts/ocean-view-new-jersey/', review: 'https://g.page/r/CXqoHr9zE3hZEBM/review' },
  { id: 'T3', name: 'Long Pond PA', cityState: 'Long Pond, PA', phone: '570-580-0567', address: '4738 PA-115, Long Pond, PA 18334', lat: 41.053988, lng: -75.534146, maps: 'https://www.google.com/maps?cid=11714838830522733253', facebook: 'https://www.facebook.com/TigonGolfCartsPoconos/', youtube: '', website: 'https://tigongolfcarts.com/long-pond', pinterest: 'https://www.pinterest.com/tigongolfcarts/long-pond-pennsylvania/', review: '' },
  { id: 'T4', name: 'Dover DE', cityState: 'Dover, DE', phone: '302-546-0010', address: '5158 N Dupont Hwy, Dover, DE 19901', lat: 39.22044318468275, lng: -75.57452048907642, maps: 'https://www.google.com/maps?cid=12843447677705895190', facebook: 'https://www.facebook.com/TigonGolfCartsDover/', youtube: 'https://www.youtube.com/@TIGONGolfCartsDoverDE', website: 'https://tigongolfcarts.com/dover', pinterest: 'https://www.pinterest.com/tigongolfcarts/dover-delaware/', review: 'https://g.page/r/CRa9-YidFz2yEBM/review' },
  { id: 'T5', name: 'Scranton-Wilkes-Barre PA', cityState: 'Scranton, PA', phone: '570-344-4443', address: '1225 N Keyser Ave #2, Scranton, PA 18504', lat: 41.4374075, lng: -75.6835104, maps: 'https://www.google.com/maps?cid=13243686786001524416', facebook: 'https://www.facebook.com/TigonGolfCartsScranton/', youtube: 'https://www.youtube.com/@TIGONGolfCartsScrantonWilkesPA', website: 'https://tigongolfcarts.com/scranton-wilkes-barre', pinterest: 'https://www.pinterest.com/tigongolfcarts/scranton-pennsylvania/', review: 'https://g.page/r/CcDWJ7z2Bsu3EBM/review' },
  { id: 'T6', name: 'Raleigh NC', cityState: 'Raleigh, NC', phone: '984-489-0296', address: '2700 S Wilmington St, Raleigh, NC 27603', lat: 35.7471032, lng: -78.6452007, maps: 'https://www.google.com/maps?cid=14570072271497929915', facebook: 'https://www.facebook.com/TigonGolfCartsRaleigh/', youtube: 'https://www.youtube.com/@TIGONGolfCartsRaleighNC', website: 'https://tigongolfcarts.com/raleigh', pinterest: 'https://www.pinterest.com/tigongolfcarts/raleigh-north-carolina/', review: 'https://g.page/r/CbskZw6JSzPKEBM/review' },
  { id: 'T7', name: 'South Bend IN', cityState: 'South Bend, IN', phone: '574-703-0456', address: '52129 State Road 933, South Bend, IN 46637', lat: 41.7360283, lng: -86.2511865, maps: 'https://www.google.com/maps?cid=17532455648086849827', facebook: 'https://www.facebook.com/TigonGolfCartsSouthBend/', youtube: 'https://www.youtube.com/@TIGONGolfCartsSouthBendIN', website: 'https://tigongolfcarts.com/south-bend', pinterest: 'https://www.pinterest.com/tigongolfcarts/south-bend-indiana/', review: 'https://g.page/r/CSP5gWCFy0_zEBM/review' },
  { id: 'T8', name: 'Gloucester Point VA', cityState: 'Gloucester Point, VA', phone: '804-792-0234', address: '2810 George Washington Memorial Hwy, Gloucester Point, VA 23072', lat: 37.2850625, lng: -76.5074161, maps: 'https://www.google.com/maps?cid=16682967888503617377', facebook: 'https://www.facebook.com/TigonGolfCartsGloucesterPoint/', youtube: 'https://www.youtube.com/@TIGONGolfCartsGloucesterPoint', website: 'https://tigongolfcarts.com/gloucester-point', pinterest: 'https://www.pinterest.com/tigongolfcarts/gloucester-point-virginia/', review: '' },
  { id: 'T9', name: 'Bayville NJ', cityState: 'Bayville, NJ', phone: '732-908-7166', address: '155 Atlantic City Blvd, Bayville, NJ 08721', lat: 39.9277698, lng: -74.1748497, maps: 'https://www.google.com/maps?cid=16812778070531162551', facebook: 'https://www.facebook.com/TigonGolfCartsBayville/', youtube: '', website: 'https://tigongolfcarts.com/bayville', pinterest: 'https://www.pinterest.com/tigongolfcarts/bayville-new-jersey/', review: 'https://g.page/r/CbfBfMWT_FLpEBM/review' },
  { id: 'T10', name: 'Waretown NJ', cityState: 'Waretown, NJ', phone: '732-998-8146', address: '526 US-9, Waretown, NJ 08758', lat: 39.7998853, lng: -74.1971619, maps: 'https://www.google.com/maps?cid=11595558320608622005', facebook: 'https://www.facebook.com/TigonGolfCartsWaretown/', youtube: '', website: 'https://tigongolfcarts.com/waretown', pinterest: 'https://www.pinterest.com/tigongolfcarts/waretown-new-jersey/', review: 'https://g.page/r/CbW1M1DbsuugEBM/review' },
  { id: 'T11', name: 'Orangeburg SC', cityState: 'Orangeburg, SC', phone: '803-596-0246', address: '4166 North Rd, Orangeburg, SC 29118', lat: 33.547201, lng: -80.9162039, maps: 'https://www.google.com/maps?cid=17192321019507936230', facebook: 'https://www.facebook.com/TigonGolfCartsOrangeburg/', youtube: 'https://www.youtube.com/@TIGONGolfCartsOrangeburgSC', website: 'https://tigongolfcarts.com/orangeburg', pinterest: 'https://www.pinterest.com/tigongolfcarts/orangeburg-south-carolina/', review: 'https://g.page/r/CeaLQODgZJfuEBM/review' },
  { id: 'T12', name: 'Lecanto FL', cityState: 'Lecanto, FL', phone: '352-453-0345', address: '299 E. Gulf to Lake Hwy, Lecanto, FL 34461', lat: 28.858622, lng: -82.4295381, maps: 'https://www.google.com/maps?cid=4773802157529013859', facebook: 'https://www.facebook.com/TigonGolfCartsLecanto/', youtube: 'https://www.youtube.com/@TIGONGolfCartsLecantoFL', website: 'https://tigongolfcarts.com/lecanto', pinterest: 'https://www.pinterest.com/tigongolfcarts/lecanto-florida/', review: 'https://g.page/r/CWOeggPF8z9CEBM/review' },
  { id: 'T13', name: 'Swanton OH', cityState: 'Swanton, OH', phone: '419-402-8400', address: '10420 Airport Hwy, Swanton, OH 43558', lat: 41.6013184, lng: -83.7926472, maps: 'https://www.google.com/maps?cid=16517552730289967239', facebook: 'https://www.facebook.com/TigonGolfCartsSwanton/', youtube: 'https://www.youtube.com/@TIGONGolfCartsSwantonOH', website: 'https://tigongolfcarts.com/swanton', pinterest: 'https://www.pinterest.com/tigongolfcarts/swanton-ohio/', review: 'https://g.page/r/CYeQt8exIjrlEBM/review' },
  { id: 'T14', name: 'Rio Grande NJ', cityState: 'Rio Grande, NJ', phone: '609-551-0234', address: '1304 NJ-47 b, Rio Grande, NJ 08242', maps: 'https://www.google.com/maps?cid=17469351422439742131', facebook: 'https://www.facebook.com/TigonGolfCartsRioGrande/', youtube: '', website: 'https://tigongolfcarts.com/rio-grande', pinterest: 'https://www.pinterest.com/tigongolfcarts/rio-grande-new-jersey/', review: 'https://g.page/r/CbNa_OaPmm_yEBM/review' },
];

export const DEALERSHIP_BY_ID: Record<string, Dealership> = Object.fromEntries(DEALERSHIPS.map((d) => [d.id, d]));

export const ACCOUNT_GROUPS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'Other'];

// Legacy identities from the standalone app (postedBy keys). A signed-in user can
// claim one so their historical "posted" state carries over.
export const LEGACY_USERS = [
  { id: 'manager', name: 'Manager' },
  { id: 'navid', name: 'Navid' },
  { id: 'victoria', name: 'Victoria' },
  { id: 'sales', name: 'Sales' },
];

export const SEED_ACCOUNTS: Record<string, string[]> = {
  T1: ['Armando Fuentes Jr', 'Barbara Woodrich', 'Jeffrey Honda', 'Michael Benedict', 'Yusuf Mustaf Rahman'],
  T2: ['Mahin Saleem Cassim'],
  T3: ['Ana Sepulveda', 'Cindra James', 'Coleen Hohn'],
  T4: ['Hilary Lowenstein', 'Newell Carapezzi'],
  T6: ['Nilande Louis'],
  T7: ['Boswell Hamilton', 'Robin Masfield'],
  T8: ['Elizabeth Garcia', 'Grace Kim'],
  T9: ['Alic Starkey'],
  T10: ['Salah Al Sandaqchi'],
  Other: [
    'Nancy Swanson', 'Peggy Longshore', 'Susan Dilsaver', 'Ronald Carapezzi', 'Camille Jourdain',
    'Judith Baxter', 'Lola Peterson', 'Rachel Davis', 'Younan Hasado', 'Kassandra Ibarra',
    'Grace Cervin', 'Margaret Jenkins', 'Salvador Sanchez', 'Shlomo Zikri', 'Jude Andrepont',
    'Tamara Young', 'Alejandro Govea', 'Boston Lesjak', 'Julie Long', 'Phillip Glaze',
    'Jason Ritchie', 'Jose Herrera', 'Marie Perlis', 'Terry Savage', 'Robert Ireland', 'Carol Ireland',
  ],
};

/** "City, ST" for stores, "TIGON National" for T0, else the raw id. */
export function locationName(id: string): string {
  const d = DEALERSHIP_BY_ID[id];
  return d ? d.cityState || d.name : id || 'Other';
}

/** City only, for cart names ("Hatfield"). */
export function locationCity(id: string): string {
  const d = DEALERSHIP_BY_ID[id];
  return d?.cityState ? d.cityState.split(',')[0] : '';
}

export function locationRank(id: string): number {
  const i = LOCATION_ORDER.indexOf(id);
  return i === -1 ? LOCATION_ORDER.length : i;
}
