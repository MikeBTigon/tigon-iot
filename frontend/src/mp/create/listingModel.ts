// Listings created in the app: form model <-> DMS-shaped mp_carts payload.
// The payload mirrors the DMS cart JSON so mapDmsCartObject (cartLogic.ts) reads it unchanged.
import { mapDmsCartObject } from '../cartLogic';
import type { Cart } from '../types';

type Json = Record<string, unknown>;

export type ListingCategory = 'golf cart' | 'utility' | 'accessory' | 'part' | 'other';
export const CATEGORIES: ListingCategory[] = ['golf cart', 'utility', 'accessory', 'part', 'other'];

/** Everything the New listing form edits (strings for inputs, booleans for switches). */
export interface ListingForm {
  make: string;
  model: string;
  year: string;
  color: string;
  seatColor: string;
  passengers: string;
  isElectric: boolean;
  batteryType: string;
  packVoltage: string;
  isLifted: boolean;
  isStreetLegal: boolean;
  hasSoundSystem: boolean;
  hasExtendedTop: boolean;
  hasHitch: boolean;
  tireRimSize: string;
  tireType: string;
  isUsed: boolean;
  price: string;
  locationId: string;
  serial: string;
  description: string;
  category: ListingCategory;
}

export const EMPTY_FORM: ListingForm = {
  make: '', model: '', year: '', color: '', seatColor: '', passengers: '', isElectric: true, batteryType: '',
  packVoltage: '', isLifted: false, isStreetLegal: false, hasSoundSystem: false, hasExtendedTop: false,
  hasHitch: false, tireRimSize: '', tireType: '', isUsed: true, price: '', locationId: '', serial: '',
  description: '', category: 'golf cart',
};

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});

/** Parses "$12,500" / "12500.00" → 12500 (0 when not a number). */
export function parsePrice(v: string): number {
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/**
 * DMS-shaped payload for a manual listing. `prev` (the existing raw payload when editing)
 * is kept underneath so fields this form doesn't know about survive.
 */
export function buildPayload(form: ListingForm, docId: string, photoUrls: string[], prev: Json = {}): Json {
  return {
    ...prev,
    _id: docId,
    cartType: { ...obj(prev.cartType), make: form.make.trim(), model: form.model.trim(), year: form.year.trim() },
    cartAttributes: {
      ...obj(prev.cartAttributes),
      cartColor: form.color.trim(),
      seatColor: form.seatColor.trim(),
      passengers: form.passengers.trim(),
      isLifted: form.isLifted,
      hasSoundSystem: form.hasSoundSystem,
      hasExtendedTop: form.hasExtendedTop,
      hasHitch: form.hasHitch,
      tireRimSize: form.tireRimSize.trim(),
      tireType: form.tireType.trim(),
    },
    battery: { ...obj(prev.battery), type: form.isElectric ? form.batteryType.trim() : '', packVoltage: form.isElectric ? form.packVoltage.trim() : '' },
    cartLocation: { ...obj(prev.cartLocation), locationId: form.locationId || 'Other' },
    retailPrice: parsePrice(form.price),
    isUsed: form.isUsed,
    isElectric: form.isElectric,
    serialNo: form.serial.trim(),
    title: { ...obj(prev.title), isStreetLegal: form.isStreetLegal },
    imageUrls: photoUrls,
    isInStock: true,
    _mpDescription: form.description.trim(),
    _mpCategory: form.category,
  };
}

/** mp_carts fields shared by create and update (payload + the indexed copies). */
export function cartDocFields(form: ListingForm, docId: string, photoUrls: string[], prev: Json = {}) {
  return {
    payload: JSON.stringify(buildPayload(form, docId, photoUrls, prev)),
    savedAt: Date.now(),
    serial: form.serial.trim(),
    locationId: form.locationId || 'Other',
    isUsed: form.isUsed,
    photoUrls,
  };
}

/** Fields only set when a manual listing is first created (must satisfy the mp_carts create rule). */
export function newCartFields(uid: string) {
  return {
    source: 'manual' as const,
    createdBy: uid,
    createdAt: Date.now(),
    dmsId: '',
    postedBy: {},
    postedAccounts: {},
  };
}

/** Parses a stored payload string (tolerates bad JSON). */
export function parsePayload(payload: unknown): Json {
  if (typeof payload !== 'string') return obj(payload);
  try {
    return obj(JSON.parse(payload));
  } catch {
    return {};
  }
}

/** Form values from an existing manual listing's raw payload. */
export function formFromPayload(raw: Json): ListingForm {
  const c = mapDmsCartObject(raw);
  const cat = str(raw._mpCategory) as ListingCategory;
  return {
    make: c.make, model: c.model, year: c.year, color: c.color, seatColor: c.seatColor,
    passengers: c.passengers ? String(c.passengers) : '', isElectric: c.isElectric, batteryType: c.batteryType,
    packVoltage: c.packVoltage, isLifted: c.isLifted, isStreetLegal: c.isStreetLegal, hasSoundSystem: c.hasSoundSystem,
    hasExtendedTop: c.hasExtendedTop, hasHitch: c.hasHitch, tireRimSize: c.tireRimSize, tireType: c.tireType,
    isUsed: c.isUsed, price: c.price ? String(c.price) : '', locationId: c.locationId === 'Other' ? '' : c.locationId,
    serial: c.serial, description: str(raw._mpDescription), category: CATEGORIES.includes(cat) ? cat : 'golf cart',
  };
}

/** A Cart built from the form (for previews and template filling). */
export function previewCart(form: ListingForm, photoUrls: string[]): Cart {
  return mapDmsCartObject(buildPayload(form, 'preview', photoUrls));
}

// ---------------------------------------------------------------------------
// CSV import helpers
// ---------------------------------------------------------------------------

/** Cart fields a CSV column can map to. */
export const CSV_FIELDS = [
  { key: 'make', label: 'Make', re: /^(make|brand|manufacturer|vendor)$/i },
  { key: 'model', label: 'Model', re: /^model$/i },
  { key: 'year', label: 'Year', re: /^(year|model ?year)$/i },
  { key: 'color', label: 'Color', re: /^(colou?r|body ?colou?r|cart ?colou?r)$/i },
  { key: 'seatColor', label: 'Seat color', re: /^seat ?colou?r$/i },
  { key: 'passengers', label: 'Passengers', re: /^(passengers?|seats?|seating)$/i },
  { key: 'price', label: 'Price', re: /^(price|retail ?price|sale ?price|msrp|asking|amount)$/i },
  { key: 'location', label: 'Location / store', re: /^(location|store|location ?id|branch|lot)$/i },
  { key: 'condition', label: 'Condition (new/used)', re: /^(condition|new ?\/ ?used|used|is ?used|new or used)$/i },
  { key: 'fuel', label: 'Electric / gas', re: /^(fuel|power|fuel ?type|electric|gas|powertrain)$/i },
  { key: 'batteryType', label: 'Battery type', re: /^battery( ?type)?$/i },
  { key: 'serial', label: 'Serial / VIN', re: /^(serial|serial ?(no|number|#)|vin|sku|stock ?(no|number|#)?)$/i },
  { key: 'photos', label: 'Photo URLs', re: /^(photos?|images?|image ?urls?|pictures?|photo ?urls?)$/i },
  { key: 'description', label: 'Description', re: /^(description|details|notes|comments)$/i },
] as const;

export type CsvField = (typeof CSV_FIELDS)[number]['key'];

/** Guesses column → field by header name. */
export function guessMapping(headers: string[]): Partial<Record<CsvField, string>> {
  const out: Partial<Record<CsvField, string>> = {};
  for (const f of CSV_FIELDS) {
    const h = headers.find((x) => f.re.test(x.trim()));
    if (h) out[f.key] = h;
  }
  return out;
}

const YES = /^(y|yes|true|1)$/i;
const NO = /^(n|no|false|0)$/i;

/**
 * Resolves a store value ("T3", "t3", "Hatfield", "Hatfield, PA") to a location id.
 * `stores` is DEALERSHIPS (passed in to keep this file free of large constants).
 */
export function resolveLocation(v: string, stores: Array<{ id: string; name: string; cityState: string }>, fallback: string): string {
  const s = v.trim();
  if (!s) return fallback;
  const byId = stores.find((d) => d.id.toLowerCase() === s.toLowerCase());
  if (byId) return byId.id;
  const low = s.toLowerCase();
  const byName = stores.find(
    (d) => (d.cityState && (d.cityState.toLowerCase() === low || d.cityState.split(',')[0].toLowerCase() === low)) || d.name.toLowerCase() === low,
  );
  return byName ? byName.id : fallback;
}

/** One CSV row → form (+ photo URLs). Returns null when the row lacks make+model or price. */
export function formFromCsvRow(
  row: Record<string, string>,
  mapping: Partial<Record<CsvField, string>>,
  stores: Array<{ id: string; name: string; cityState: string }>,
  defaultLocation: string,
): { form: ListingForm; photos: string[] } | null {
  const g = (f: CsvField) => (mapping[f] ? str(row[mapping[f] as string]) : '');
  const make = g('make');
  const model = g('model');
  const price = parsePrice(g('price'));
  if (!make || !model || !price) return null;
  const cond = g('condition');
  // "new"/"used" text, or yes/no under a header like "Used" or "Is new".
  const header = mapping.condition || '';
  const headerMeansNew = /new/i.test(header) && !/used/i.test(header);
  let isUsed = true;
  if (YES.test(cond)) isUsed = !headerMeansNew;
  else if (NO.test(cond)) isUsed = headerMeansNew;
  else if (/\bnew\b/i.test(cond) && !/used|pre-?owned/i.test(cond)) isUsed = false;
  const fuel = g('fuel');
  const isElectric = !fuel ? true : /gas|gasoline|efi/i.test(fuel) ? false : NO.test(fuel) ? false : true;
  const photos = g('photos')
    .split(/[\s,|;]+/)
    .map((u) => u.trim())
    .filter((u) => /^https:\/\//i.test(u));
  return {
    form: {
      ...EMPTY_FORM,
      make,
      model,
      year: g('year').replace(/[^0-9]/g, '').slice(0, 4),
      color: g('color'),
      seatColor: g('seatColor'),
      passengers: g('passengers').replace(/[^0-9]/g, ''),
      price: String(price),
      locationId: resolveLocation(g('location'), stores, defaultLocation),
      isUsed,
      isElectric,
      batteryType: isElectric ? g('batteryType') : '',
      serial: g('serial'),
      description: g('description'),
    },
    photos,
  };
}

/** CSV template users can download and fill in. */
export const CSV_TEMPLATE =
  'make,model,year,color,seat color,passengers,price,location,condition,fuel,battery type,serial,photos,description\n' +
  'Evolution,D5 Maverick,2025,Candy Apple Red,Black,4,12995,T1,new,electric,Lithium,EV123456,https://example.com/1.jpg|https://example.com/2.jpg,Lifted 4 seater with LED lights\n';
