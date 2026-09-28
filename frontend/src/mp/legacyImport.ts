// One-time migration from the standalone MP Assistant (tigon-marketplace, public Firestore)
// into the IoT project's mp_* collections. Posting history is preserved; postedBy keys stay
// as the legacy user ids (manager/navid/...) which users can claim on their MP profile.
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS, LEGACY_API_KEY, LEGACY_PROJECT_ID } from './constants';
import { cartFromDoc } from './cartUtils';

type RestValue = Record<string, unknown>;

function decode(v: RestValue | undefined): unknown {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(String(v.timestampValue));
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeFields(((v.mapValue as RestValue)?.fields || {}) as Record<string, RestValue>);
  if ('arrayValue' in v) return (((v.arrayValue as RestValue)?.values || []) as RestValue[]).map(decode);
  return null;
}

function decodeFields(fields: Record<string, RestValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}

async function listLegacy(collection: string, onProgress?: (n: number) => void) {
  const out: Array<{ id: string; data: Record<string, unknown> }> = [];
  let pageToken = '';
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${LEGACY_PROJECT_ID}/databases/(default)/documents/${collection}`);
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('key', LEGACY_API_KEY);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Legacy ${collection} read failed (${res.status})`);
    const json = await res.json();
    for (const d of json.documents || []) {
      out.push({ id: String(d.name).split('/').pop()!, data: decodeFields(d.fields || {}) });
    }
    onProgress?.(out.length);
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function writeAll(items: Array<{ col: string; id: string; data: Record<string, unknown> }>) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    for (const it of items.slice(i, i + 400)) batch.set(doc(db, it.col, it.id), it.data, { merge: true });
    await batch.commit();
  }
}

export async function importLegacyData(onStatus: (msg: string) => void) {
  onStatus('Reading legacy accounts…');
  const accounts = await listLegacy('accounts');
  onStatus(`Reading legacy carts… (${accounts.length} accounts found)`);
  const carts = await listLegacy('carts', (n) => onStatus(`Reading legacy carts… ${n}`));

  const items = [
    ...accounts.map((a, i) => ({
      col: COLLECTIONS.accounts,
      id: a.id,
      data: { name: String(a.data.name || ''), group: String(a.data.group || 'Other'), owner: String(a.data.owner || ''), order: i },
    })),
    ...carts.map((c) => {
      const mapped = cartFromDoc(c.id, c.data as never);
      const payload = typeof c.data.payload === 'string' ? c.data.payload : JSON.stringify(c.data.payload || {});
      return {
        col: COLLECTIONS.carts,
        id: c.id,
        data: {
          payload,
          savedAt: Number(c.data.savedAt) || Date.now(),
          dmsId: String(c.data.dmsId || mapped.dmsId),
          serial: String(c.data.serial || mapped.serial),
          locationId: mapped.locationId,
          isUsed: mapped.isUsed,
          postedBy: (c.data.postedBy as object) || {},
          postedAccounts: (c.data.postedAccounts as object) || {},
        },
      };
    }),
  ];
  onStatus(`Writing ${items.length} records…`);
  await writeAll(items);
  const msg = `Imported ${carts.length} carts and ${accounts.length} accounts from the legacy MP Assistant.`;
  onStatus(msg);
  return msg;
}
