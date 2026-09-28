// Webhook Flows — pure field helpers: mapping incoming form fields, normalizing values, dedupe keys.
import {IMAGE_FIELDS, LEAD_FIELDS, TRACKING_FIELDS} from './types';

export const MAX_VALUE_LEN = 5000;

const STANDARD = new Set<string>([...LEAD_FIELDS, ...TRACKING_FIELDS]);

/** Common names websites use → standard field. Keys are normalized (see normKey). */
export const FIELD_ALIASES: Record<string, string> = {
  fname: 'first_name', firstname: 'first_name', first: 'first_name', given_name: 'first_name', your_first_name: 'first_name',
  lname: 'last_name', lastname: 'last_name', last: 'last_name', surname: 'last_name', family_name: 'last_name', your_last_name: 'last_name',
  phone: 'phone1', tel: 'phone1', telephone: 'phone1', phone_number: 'phone1', phonenumber: 'phone1', mobile: 'phone1',
  cell: 'phone1', cell_phone: 'phone1', mobile_phone: 'phone1', your_phone: 'phone1', phone_1: 'phone1',
  phone_2: 'phone2', alt_phone: 'phone2', secondary_phone: 'phone2', work_phone: 'phone2', home_phone: 'phone2',
  e_mail: 'email', email_address: 'email', emailaddress: 'email', mail: 'email', your_email: 'email',
  zip: 'zip_code', zipcode: 'zip_code', postal_code: 'zip_code', postalcode: 'zip_code', postcode: 'zip_code', postal: 'zip_code',
  message: 'comments', comment: 'comments', msg: 'comments', notes: 'comments', note: 'comments', question: 'comments',
  questions: 'comments', your_message: 'comments', details: 'comments', inquiry: 'comments', enquiry: 'comments',
  page_url: 'url', pageurl: 'url', page: 'url', source_url: 'url', landing_page: 'url', current_url: 'url',
  street: 'address', street_address: 'address', address1: 'address', address_1: 'address', full_address: 'address',
  vehicle_model: 'model', cart_model: 'model', product: 'model', product_name: 'model', vehicle: 'model',
  make: 'brand', manufacturer: 'brand',
  vin: 'vin_number', vin_no: 'vin_number', sku: 'sku_number', stock_number: 'sku_number', stock: 'sku_number', stock_no: 'sku_number',
  form: 'form_name', formname: 'form_name', form_title: 'form_name',
  referer: 'referrer', referrer_url: 'referrer', useragent: 'user_agent',
  image: 'image_1', photo: 'image_1', picture: 'image_1', image1: 'image_1', photo_1: 'image_1', photo1: 'image_1',
  image2: 'image_2', photo_2: 'image_2', photo2: 'image_2', image3: 'image_3', photo_3: 'image_3', photo3: 'image_3',
  gaclientid: 'ga_client_id', ga_cid: 'ga_client_id', client_id: 'ga_client_id', cid: 'ga_client_id',
};

/** Keys that are never lead data (spam tokens, framework noise). */
export const IGNORED_KEYS = new Set([
  'cf-turnstile-response', 'g-recaptcha-response', 'h-captcha-response', '_wpcf7', '_wpcf7_version', '_wpcf7_locale',
  '_wpcf7_unit_tag', '_wpcf7_container_post', '_wpnonce', 'action', 'submit', 'key', 'user_ip',
]);

/** "Your E-mail" → "your_e_mail"; "fields[email]" → "email". */
export function normKey(k: string): string {
  let s = String(k).trim();
  const br = s.match(/\[([^\]]+)\]$/);
  if (br) s = br[1];
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Standard field for an incoming key, or null when it stays an extra. */
export function mapKey(k: string, fieldMap?: Record<string, string>): string | null {
  const fm = fieldMap || {};
  const n = normKey(k);
  const mapped = fm[k] || fm[n];
  if (mapped) return mapped === 'ignore' ? '' : mapped;
  if (STANDARD.has(n)) return n;
  if (FIELD_ALIASES[n]) return FIELD_ALIASES[n];
  return null;
}

export const cleanValue = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  let s: string;
  if (Array.isArray(v)) s = v.map((x) => cleanValue(x)).filter(Boolean).join(', ');
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\u0000/g, '').trim();
  return s.length > MAX_VALUE_LEN ? s.slice(0, MAX_VALUE_LEN) : s;
};

export interface MappedFields {
  fields: Record<string, string>;
  extra: Record<string, string>;
}

/**
 * Map flat incoming values to standard + tracking fields. Unknown keys go to `extra`.
 * `user_ip` from the client is always ignored. "name"/"full_name" is split into first/last when those are missing.
 */
export function mapFields(input: Record<string, unknown>, fieldMap?: Record<string, string>, skipKeys: string[] = []): MappedFields {
  const fields: Record<string, string> = {};
  const extra: Record<string, string> = {};
  const skip = new Set(skipKeys.map((k) => k.toLowerCase()));
  let fullName = '';
  for (const [k, raw] of Object.entries(input)) {
    if (!k || skip.has(k.toLowerCase()) || IGNORED_KEYS.has(k.toLowerCase())) continue;
    const v = cleanValue(raw);
    if (!v) continue;
    const std = mapKey(k, fieldMap);
    if (std === '') continue; // explicitly ignored in the field map
    if (std === 'user_ip') continue;
    if (std && (STANDARD.has(std))) {
      fields[std] = fields[std] ? fields[std] : v;
      continue;
    }
    const n = normKey(k);
    if (['name', 'full_name', 'fullname', 'your_name', 'customer_name', 'contact_name'].includes(n)) {
      fullName = fullName || v;
      continue;
    }
    if (Object.keys(extra).length < 100) extra[k.slice(0, 100)] = v;
  }
  if (fullName) {
    if (!fields.first_name && !fields.last_name) {
      const parts = fullName.split(/\s+/);
      fields.first_name = parts.shift() || '';
      if (parts.length) fields.last_name = parts.join(' ');
    } else {
      extra.name = fullName;
    }
  }
  if (fields.email) fields.email = fields.email.toLowerCase();
  return {fields, extra};
}

/** Standard image field for an uploaded file's form field name (null = next free slot). */
export function imageFieldFor(fieldName: string, fieldMap?: Record<string, string>): string | null {
  const m = mapKey(fieldName, fieldMap);
  return m && (IMAGE_FIELDS as readonly string[]).includes(m) ? m : null;
}

// ---------------------------------------------------------------------------
// Normalization (master flow) and dedupe keys
// ---------------------------------------------------------------------------

export const phoneDigits = (p?: string) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
};

export function formatPhone(p?: string): string {
  const raw = String(p || '').trim();
  const d = raw.replace(/\D/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** "jANE" stays; "jane smith" → "Jane Smith"; "O'NEIL" → "O'Neil". Mixed case is left alone. */
export function capitalizeName(n?: string): string {
  const s = String(n || '').trim().replace(/\s+/g, ' ');
  if (!s) return s;
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

/** Patch that normalizes a submission's contact fields (empty object when nothing changes). */
export function normalizePatch(sub: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (k: string, v: string) => {
    if (v && v !== sub[k]) out[k] = v;
  };
  if (typeof sub.email === 'string') set('email', sub.email.trim().toLowerCase());
  for (const k of ['phone1', 'phone2']) if (typeof sub[k] === 'string') set(k, formatPhone(sub[k] as string));
  for (const k of ['first_name', 'last_name']) if (typeof sub[k] === 'string') set(k, capitalizeName(sub[k] as string));
  if (typeof sub.zip_code === 'string') set('zip_code', (sub.zip_code as string).trim().toUpperCase());
  return out;
}

/** Normalized value used to compare a field between submissions ('' = nothing to compare). */
export function dedupeValue(field: string, v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (field === 'email') return s.toLowerCase();
  if (field === 'phone1' || field === 'phone2' || field === 'phone') {
    const d = phoneDigits(s);
    return d.length >= 7 ? d : '';
  }
  return s.toLowerCase().replace(/\s+/g, ' ');
}

/** Fields indexed in `dedupeKeys` (array-contains queries need no composite index). */
export const DEDUPE_INDEXED = ['email', 'phone1', 'phone2', 'vin_number', 'sku_number'];

/** Group name used in dedupe keys: phone1 and phone2 share 'phone'. */
export const dedupeGroup = (f: string) => (f === 'phone1' || f === 'phone2' ? 'phone' : f);

export function dedupeKeys(sub: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  for (const f of DEDUPE_INDEXED) {
    const v = dedupeValue(f, sub[f]);
    if (v) keys.add(dedupeGroup(f) + ':' + v);
  }
  return Array.from(keys);
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
