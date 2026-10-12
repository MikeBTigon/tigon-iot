// Webhook Flows — Google Sheets: the step buffers one row (wh_sheet_buffer/{runId}); flushSheetBuffer appends in batches.
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import {GoogleAuth} from 'google-auth-library';
import {createHash} from 'crypto';
import {LEAD_FIELDS, TRACKING_FIELDS, WH} from '../types';
import {fieldLabel} from '../shared';
import type {StepContext, StepResult} from '../engineTypes';
import {healSheetsApi} from '../google';
import {ctxMergeData, errMsg, fail, formatNy, isTestSubmission, leadUrl, skip, toList} from './util';

export const SHEETS_SERVICE_ACCOUNT = '470095494000-compute@developer.gserviceaccount.com';
export const DEFAULT_COLUMNS: string[] = [
  'received_at', 'domain', 'form_name', ...LEAD_FIELDS.filter((f) => f !== 'form_name'), ...TRACKING_FIELDS,
  'status', 'submission_id', 'lead_url', 'test',
];
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const MAX_ATTEMPTS = 8;
const BATCH_LIMIT = 2000;
const STATUS_DOC = 'sheets_status';
const DEAD_RETRY_MS = 60 * 60 * 1000;
/** One marker per lead + sheet + tab, so a lead is never added to the same sheet twice. */
const SHEET_ROWS = 'wh_sheet_rows';

const db = () => admin.firestore();

/** Accepts a bare id or any Google Sheets URL (…/spreadsheets/d/<id>/edit#gid=0). */
export function extractSheetId(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s || s === 'inherit') return '';
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : '';
}

/** Values that a spreadsheet could treat as a formula get a leading apostrophe (phone numbers like +1 555… are left alone). */
export function safeCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) return `'${s}`;
  return s.slice(0, 45000);
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

export async function sheetsStep(ctx: StepContext): Promise<StepResult> {
  const c = ctx.step.config || {};
  const rawId = typeof c.spreadsheetId === 'string' && c.spreadsheetId && c.spreadsheetId !== 'inherit' ? c.spreadsheetId : ctx.settings.sheetId;
  if (!rawId) return skip('no sheet');
  const spreadsheetId = extractSheetId(rawId);
  if (!spreadsheetId) return fail(`"${String(rawId).slice(0, 120)}" is not a Google Sheets link or id.`, false);
  const tab = (typeof c.tab === 'string' && c.tab.trim()) || ctx.settings.sheetTab || 'Leads';
  const isTest = isTestSubmission(ctx.submission);
  const columns = toList(c.columns).length ? toList(c.columns) : [...DEFAULT_COLUMNS];
  if (isTest && !columns.includes('test')) columns.push('test');

  const data = ctxMergeData(ctx);
  const sub = ctx.submission;
  const special: Record<string, string> = {
    received_at: formatNy(Number(sub.receivedAt) || Date.now()),
    domain: data.domain_name || '',
    form_name: data.form_name || '',
    status: sub.isSpam ? 'spam' : sub.isDuplicate ? 'duplicate' : 'new',
    submission_id: sub.id,
    lead_url: leadUrl(sub.id),
    test: isTest ? 'TEST' : '',
  };
  const row = columns.map((col) => safeCell(col in special ? special[col] : data[col] ?? ''));
  // One row per lead per sheet: the website flow and the Master Flow often point at the same sheet.
  const onceId = `${sub.id}_${createHash('sha1').update(`${spreadsheetId}|${tab.trim().toLowerCase()}`).digest('hex').slice(0, 16)}`;
  try {
    await db().collection(SHEET_ROWS).doc(onceId).create({submissionId: sub.id, spreadsheetId, tab, runId: ctx.runId, at: Date.now()});
  } catch {
    return {status: 'skipped', response: {reason: 'This lead is already in that sheet', spreadsheetId, tab}};
  }
  await db().collection(WH.sheetBuffer).doc(ctx.runId).set({
    spreadsheetId, tab, columns, row, createdAt: Date.now(), submissionId: sub.id, attempts: 0, dead: false,
  });
  return {status: 'success', response: {buffered: true, spreadsheetId, tab}};
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

type TokenGetter = () => Promise<string>;
let auth: GoogleAuth | null = null;
let tokenGetter: TokenGetter = async () => {
  auth = auth || new GoogleAuth({scopes: ['https://www.googleapis.com/auth/spreadsheets']});
  const t = await auth.getAccessToken();
  if (!t) throw new Error('Could not get a Google access token for the functions service account.');
  return t;
};
/** Tests only: replace the access-token source. */
export function setSheetsTokenGetterForTests(fn: TokenGetter) {
  tokenGetter = fn;
}

const a1Tab = (tab: string) => `'${tab.replace(/'/g, '\'\'')}'`;

async function sheetsFetch(token: string, url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {...init, headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {})}});
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      msg = JSON.parse(text).error?.message || msg;
    } catch {/* not JSON */}
    if (res.status === 403 || res.status === 404) {
      msg = `No access to the spreadsheet (${res.status}: ${msg}). Share it (Editor) with ${SHEETS_SERVICE_ACCOUNT} and check the link.`;
    }
    throw new Error(msg);
  }
  return text ? JSON.parse(text) : {};
}

/** Lowercase letters/digits only: "Phone 1", "phone1", "PHONE_1" → "phone1". */
export const normHeader = (h: unknown) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Other names people use for our columns in their own sheets (normalized). */
const ALIASES: Record<string, string[]> = {
  received_at: ['date', 'datetime', 'timestamp', 'time', 'received', 'submitted', 'submittedat', 'createdat', 'datesubmitted', 'entrydate'],
  domain: ['website', 'site', 'domainname', 'websitename', 'source', 'dealer', 'dba'],
  form_name: ['form', 'formname', 'formtitle'],
  first_name: ['first', 'firstname', 'fname', 'givenname'],
  last_name: ['last', 'lastname', 'lname', 'surname', 'familyname'],
  phone1: ['phone', 'phonenumber', 'mobile', 'cell', 'telephone', 'tel', 'phone1'],
  phone2: ['phone2', 'altphone', 'secondphone', 'otherphone'],
  email: ['email', 'emailaddress', 'mail'],
  zip_code: ['zip', 'zipcode', 'postalcode', 'postcode'],
  comments: ['comments', 'comment', 'message', 'notes', 'questions'],
  user_ip: ['ip', 'ipaddress', 'userip'],
  url: ['url', 'pageurl', 'page', 'sourceurl', 'landingpage'],
  vin_number: ['vin', 'vinnumber'],
  sku_number: ['sku', 'skunumber', 'stock', 'stocknumber'],
  status: ['status', 'leadstatus'],
  submission_id: ['submissionid', 'leadid', 'id'],
  lead_url: ['leadurl', 'leadlink'],
  test: ['test'],
};

/** Which of our column keys a sheet header cell means ('' = none). */
export function headerKey(header: unknown, known: string[]): string {
  const h = normHeader(header);
  if (!h) return '';
  for (const k of known) {
    if (normHeader(k) === h || normHeader(k === 'test' ? 'Test' : fieldLabel(k)) === h) return k;
  }
  for (const k of known) if ((ALIASES[k] || []).includes(h)) return k;
  return '';
}

/** A header row that looks like a leads sheet (3+ of our columns). */
export const looksLikeLeadsHeader = (header: unknown[], known: string[]) =>
  header.filter((h) => headerKey(h, known)).length >= 3;

export interface BufferedRow {columns: string[]; row: string[]}

/**
 * Lines the rows up with the sheet's own header row: each value goes under the header that means the same field
 * (exact key, label like "First name", or a common alias like "Phone"/"ZIP"). Our columns the sheet doesn't have are
 * added to the right of the header. Returns the new header (if it changed) and the rows in sheet order.
 */
export function alignRows(header: string[], items: BufferedRow[], extend = true): {header: string[]; added: boolean; rows: string[][]} {
  const allKeys = Array.from(new Set(items.flatMap((i) => i.columns)));
  const out = header.map((h) => String(h ?? ''));
  const keyAt: string[] = out.map((h) => headerKey(h, allKeys));
  // One header column per field (first match wins).
  const seen = new Set<string>();
  keyAt.forEach((k, i) => {
    if (!k) return;
    if (seen.has(k)) keyAt[i] = '';
    else seen.add(k);
  });
  let added = false;
  for (const k of extend ? allKeys : []) {
    if (seen.has(k)) continue;
    // Only add a new column when some row has a value for it (keeps their sheet tidy).
    if (!items.some((it) => String(it.row[it.columns.indexOf(k)] ?? '').trim())) continue;
    out.push(k === 'test' ? 'Test' : fieldLabel(k));
    keyAt.push(k);
    seen.add(k);
    added = true;
  }
  const rows = items.map((it) => {
    const byKey = new Map(it.columns.map((c, i) => [c, it.row[i] ?? '']));
    const r = keyAt.map((k) => (k ? String(byKey.get(k) ?? '') : ''));
    while (r.length && r[r.length - 1] === '') r.pop();
    return r;
  });
  return {header: out, added, rows};
}

/** Column letter for a 1-based index (1 → A, 27 → AA). */
const colLetter = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

async function appendGroup(token: string, spreadsheetId: string, tabWanted: string, items: BufferedRow[]): Promise<string> {
  const base = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}`;
  const known = Array.from(new Set(items.flatMap((i) => i.columns)));
  const meta = await sheetsFetch(token, `${base}?fields=sheets.properties.title`);
  const titles: string[] = (meta.sheets || []).map((s: any) => String(s.properties?.title || ''));
  let tab = titles.find((t) => t === tabWanted) || titles.find((t) => t.trim().toLowerCase() === tabWanted.trim().toLowerCase()) || '';
  if (!tab) {
    // The tab named in settings doesn't exist: use a tab that already has a leads header (e.g. the first tab), else make it.
    for (const t of titles) {
      const h = await sheetsFetch(token, `${base}/values/${encodeURIComponent(a1Tab(t) + '!1:1')}`);
      if (looksLikeLeadsHeader((h.values && h.values[0]) || [], known)) {
        tab = t;
        break;
      }
    }
  }
  if (!tab) {
    tab = tabWanted;
    await sheetsFetch(token, `${base}:batchUpdate`, {method: 'POST', body: JSON.stringify({requests: [{addSheet: {properties: {title: tab}}}]})});
  }
  const head = await sheetsFetch(token, `${base}/values/${encodeURIComponent(a1Tab(tab) + '!1:1')}`);
  const current: string[] = ((head.values && head.values[0]) || []).map((v: unknown) => String(v ?? ''));
  const headerEmpty = !current.some((v) => v.trim());
  let header: string[];
  let rows: string[][];
  if (headerEmpty) {
    // New sheet: our standard header, rows in that order.
    header = (items[0]?.columns || DEFAULT_COLUMNS).map((c) => c === 'test' ? 'Test' : fieldLabel(c));
    rows = alignRows(header, items).rows;
  } else {
    // The sheet has its own header: fill only those columns, never add new ones.
    const a = alignRows(current, items, false);
    header = a.added ? a.header : current;
    rows = a.rows;
  }
  if (headerEmpty || header.length !== current.length) {
    await sheetsFetch(token, `${base}/values/${encodeURIComponent(a1Tab(tab) + '!A1')}?valueInputOption=RAW`, {
      method: 'PUT', body: JSON.stringify({values: [header]}),
    });
  }
  // Append below the last row, always starting in column A (never shifted right by Google's table detection).
  const range = `${a1Tab(tab)}!A1:${colLetter(Math.max(header.length, 1))}1`;
  await sheetsFetch(token, `${base}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', body: JSON.stringify({values: rows.map((r) => {
      const full = [...r];
      while (full.length < header.length) full.push('');
      return full;
    })}),
  });
  return tab;
}

/** Old-layout rows start with the received date, e.g. "Sep 30, 2026, 7:06 PM EDT". */
const OLD_ROW = /^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M/;

/**
 * Fixes rows written before values were lined up with the sheet's header: rows that start with the received date
 * were written in TIGON IOT's own order (DEFAULT_COLUMNS). Each is rewritten under the right headers, and repeated
 * rows for the same lead are removed (first one kept). Returns counts.
 */
export async function repairSheetRows(spreadsheetId: string, tabWanted = ''): Promise<{tab: string; fixed: number; removed: number}> {
  const token = await tokenGetter();
  const base = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}`;
  const meta = await sheetsFetch(token, `${base}?fields=sheets.properties(title,sheetId)`);
  const sheets: Array<{title: string; sheetId: number}> = (meta.sheets || []).map((x: any) => ({title: String(x.properties?.title || ''), sheetId: Number(x.properties?.sheetId || 0)}));
  const sheet = sheets.find((x) => tabWanted && x.title.trim().toLowerCase() === tabWanted.trim().toLowerCase()) || sheets[0];
  if (!sheet) throw new Error('The spreadsheet has no tabs.');
  const got = await sheetsFetch(token, `${base}/values/${encodeURIComponent(a1Tab(sheet.title))}`);
  const all: string[][] = (got.values || []).map((r: unknown[]) => r.map((v) => String(v ?? '')));
  if (all.length < 2) return {tab: sheet.title, fixed: 0, removed: 0};
  const header = all[0];
  // A sheet whose own first column is the date: its rows already start with a date, nothing to tell apart safely.
  if (headerKey(header[0], DEFAULT_COLUMNS) === 'received_at') return {tab: sheet.title, fixed: 0, removed: 0};
  const subIdx = DEFAULT_COLUMNS.indexOf('submission_id');
  const width = Math.max(header.length, ...all.map((r) => r.length));
  const seenSubs = new Set<string>();
  const remove: number[] = [];
  let fixed = 0;
  const out = all.slice(1).map((r, i) => {
    if (!OLD_ROW.test(r[0] || '')) return null;
    const sub = r[subIdx] || '';
    if (sub && seenSubs.has(sub)) {
      remove.push(i + 1); // 0-based sheet row index
      return null;
    }
    if (sub) seenSubs.add(sub);
    fixed++;
    const aligned = alignRows(header, [{columns: DEFAULT_COLUMNS, row: r}], false).rows[0];
    while (aligned.length < width) aligned.push('');
    return aligned;
  });
  // Rewrite fixed rows in place (one call per row range of consecutive fixed rows).
  const data: Array<{range: string; values: string[][]}> = [];
  out.forEach((row, i) => {
    if (row) data.push({range: `${a1Tab(sheet.title)}!A${i + 2}:${colLetter(width)}${i + 2}`, values: [row]});
  });
  for (let i = 0; i < data.length; i += 200) {
    await sheetsFetch(token, `${base}/values:batchUpdate`, {method: 'POST', body: JSON.stringify({valueInputOption: 'RAW', data: data.slice(i, i + 200)})});
  }
  if (remove.length) {
    const requests = remove.sort((a, b) => b - a).map((row) => ({
      deleteDimension: {range: {sheetId: sheet.sheetId, dimension: 'ROWS', startIndex: row, endIndex: row + 1}},
    }));
    await sheetsFetch(token, `${base}:batchUpdate`, {method: 'POST', body: JSON.stringify({requests})});
  }
  return {tab: sheet.title, fixed, removed: remove.length};
}

/** Append all buffered rows (one API call per spreadsheet+tab). Safe to run often; a lease stops overlapping runs. */
export async function flushSheetBuffer(): Promise<{rows: number; errors: number}> {
  const statusRef = db().collection(WH.settings).doc(STATUS_DOC);
  const now = Date.now();
  const gotLease = await db().runTransaction(async (tx) => {
    const s = await tx.get(statusRef);
    if (Number(s.get('flushLeaseUntil') || 0) > now) return false;
    tx.set(statusRef, {flushLeaseUntil: now + 4 * 60 * 1000}, {merge: true});
    return true;
  });
  if (!gotLease) return {rows: 0, errors: 0};

  let rows = 0;
  let errors = 0;
  let lastError = '';
  try {
    const snap = await db().collection(WH.sheetBuffer).where('dead', '==', false).limit(BATCH_LIMIT).get();
    // Rows that gave up are tried again every hour, forever — once the sheet works again they go through on their own.
    const deadSnap = await db().collection(WH.sheetBuffer).where('dead', '==', true).limit(500).get();
    const retryDead = deadSnap.docs.filter((d) => now - Number(d.get('lastAttemptAt') || 0) > DEAD_RETRY_MS);
    const docs = [...snap.docs, ...retryDead].sort((a, b) => Number(a.get('createdAt') || 0) - Number(b.get('createdAt') || 0));
    const groups = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    for (const d of docs) {
      const key = `${d.get('spreadsheetId')}\u0000${d.get('tab')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    let token = '';
    if (groups.size) token = await tokenGetter();
    for (const group of groups.values()) {
      const first = group[0];
      const spreadsheetId = String(first.get('spreadsheetId'));
      const tab = String(first.get('tab') || 'Leads');
      try {
        await appendGroup(token, spreadsheetId, tab, group.map((d) => ({
          columns: ((d.get('columns') as string[]) || DEFAULT_COLUMNS).map(String),
          row: ((d.get('row') as unknown[]) || []).map(safeCellKeep),
        })));
        rows += group.length;
        for (let i = 0; i < group.length; i += 450) {
          const b = db().batch();
          group.slice(i, i + 450).forEach((d) => b.delete(d.ref));
          await b.commit();
        }
      } catch (e) {
        errors += group.length;
        lastError = `${spreadsheetId} / ${tab}: ${errMsg(e)}`;
        // Google turned the Sheets API off (or it was never on): switch it back on; the rows go through next minute.
        if (await healSheetsApi(errMsg(e)).catch(() => false)) lastError += ' — the Google Sheets API was switched on automatically; rows will be retried.';
        logger.warn('wh sheets flush failed', {spreadsheetId, tab, rows: group.length, error: errMsg(e)});
        for (let i = 0; i < group.length; i += 450) {
          const b = db().batch();
          for (const d of group.slice(i, i + 450)) {
            const attempts = Number(d.get('attempts') || 0) + 1;
            const wasDead = d.get('dead') === true;
            const dead = wasDead || attempts >= MAX_ATTEMPTS;
            if (dead && !wasDead) logger.error('wh sheets row gave up', {id: d.id, spreadsheetId, tab, error: errMsg(e)});
            b.update(d.ref, {attempts, dead, error: errMsg(e), lastAttemptAt: Date.now(), ...(dead && !wasDead ? {deadAt: Date.now()} : {})});
          }
          await b.commit();
        }
      }
    }
  } catch (e) {
    lastError = errMsg(e);
    errors++;
    logger.error('wh sheets flush crashed', {error: lastError});
  } finally {
    const col = db().collection(WH.sheetBuffer);
    const [pending, dead] = await Promise.all([
      col.where('dead', '==', false).count().get().then((r) => r.data().count).catch(() => null),
      col.where('dead', '==', true).count().get().then((r) => r.data().count).catch(() => null),
    ]);
    await statusRef.set({
      lastFlushAt: Date.now(), lastFlushRows: rows, flushLeaseUntil: 0,
      ...(pending !== null ? {pendingRows: pending} : {}), ...(dead !== null ? {deadRows: dead} : {}),
      // A clean flush that wrote rows clears the old error (System Triage / Needs attention).
      ...(lastError ? {lastError, lastErrorAt: Date.now()} : rows > 0 ? {lastError: admin.firestore.FieldValue.delete(), lastErrorAt: admin.firestore.FieldValue.delete()} : {}),
    }, {merge: true});
  }
  return {rows, errors};
}

/** Buffered values were already escaped by the step; keep them as strings. */
const safeCellKeep = (v: unknown) => (v === undefined || v === null ? '' : String(v));
