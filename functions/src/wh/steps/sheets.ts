// Webhook Flows — Google Sheets: the step buffers one row (wh_sheet_buffer/{runId}); flushSheetBuffer appends in batches.
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import {GoogleAuth} from 'google-auth-library';
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

async function appendGroup(token: string, spreadsheetId: string, tab: string, columns: string[], rows: string[][]) {
  const base = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}`;
  const meta = await sheetsFetch(token, `${base}?fields=sheets.properties.title`);
  const titles: string[] = (meta.sheets || []).map((s: any) => s.properties?.title);
  if (!titles.includes(tab)) {
    await sheetsFetch(token, `${base}:batchUpdate`, {method: 'POST', body: JSON.stringify({requests: [{addSheet: {properties: {title: tab}}}]})});
  }
  const head = await sheetsFetch(token, `${base}/values/${encodeURIComponent(a1Tab(tab) + '!A1:1')}`);
  const headerEmpty = !(head.values && head.values[0] && head.values[0].some((v: unknown) => String(v ?? '').trim()));
  if (headerEmpty) {
    await sheetsFetch(token, `${base}/values/${encodeURIComponent(a1Tab(tab) + '!A1')}?valueInputOption=RAW`, {
      method: 'PUT', body: JSON.stringify({values: [columns.map((c) => c === 'test' ? 'Test' : fieldLabel(c))]}),
    });
  }
  await sheetsFetch(token, `${base}/values/${encodeURIComponent(a1Tab(tab) + '!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', body: JSON.stringify({values: rows}),
  });
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
        await appendGroup(token, spreadsheetId, tab, (first.get('columns') as string[]) || DEFAULT_COLUMNS,
          group.map((d) => ((d.get('row') as unknown[]) || []).map(safeCellKeep)));
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
