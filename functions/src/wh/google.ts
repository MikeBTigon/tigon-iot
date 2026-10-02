// Webhook Flows — Google connections (Settings → Google). Everything runs as the project's own service account, so there is
// no password or sign-in token that can expire: a sheet or a GA4 property is "connected" by sharing it with that account once.
//   whGoogle (callable, admin): {action}
//     check      enable the Google APIs if needed, test every spreadsheet in use, retry failed rows when they work again
//     gaList     GA4 accounts → properties → web streams the service account can see (with matching website guesses)
//     gaConnect  {domainId ('' = all websites), propertyId, streamId, acknowledge?} → finds/creates the API secret and saves it
//     gaManual   {domainId, measurementId, apiSecret} → validates and saves pasted values
//     gaDisconnect {domainId}
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {HttpsError, onCall} from 'firebase-functions/v2/https';
import {GoogleAuth} from 'google-auth-library';
import {WH} from './types';
import {db} from './config';
import {clearConfigCache} from './config';
import {requireManager} from './admin';
import {SHEETS_SERVICE_ACCOUNT, extractSheetId} from './steps/sheets';
import {errMsg} from './steps/util';

export const SERVICE_ACCOUNT = SHEETS_SERVICE_ACCOUNT;
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'tigon-iot';
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/analytics.edit',
];
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta';
const STATUS_DOC = 'google_status';
/** Google's required wording before a Measurement Protocol secret can be created through the API. */
export const GA_ACK = 'I acknowledge that I have the necessary privacy disclosures and rights from my end users for the collection and processing of their data, including the association of such data with the visitation information Google Analytics collects from my site and/or app property.';

let auth: GoogleAuth | null = null;
export async function googleToken(): Promise<string> {
  auth = auth || new GoogleAuth({scopes: SCOPES});
  const t = await auth.getAccessToken();
  if (!t) throw new Error('Could not get a Google access token for the service account.');
  return t;
}

class GoogleError extends Error {
  constructor(message: string, readonly status: number, readonly reason = '') {
    super(message);
  }
}

async function gfetch(url: string, init: RequestInit = {}): Promise<any> {
  const token = await googleToken();
  const res = await fetch(url, {...init, headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {})}});
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    let reason = '';
    try {
      const j = JSON.parse(text);
      msg = j.error?.message || msg;
      reason = j.error?.details?.find((d: any) => d.reason)?.reason || j.error?.status || '';
    } catch {/* not JSON */}
    throw new GoogleError(msg, res.status, reason);
  }
  return text ? JSON.parse(text) : {};
}

const disabledApi = (e: unknown) => e instanceof GoogleError && (e.reason === 'SERVICE_DISABLED' || /has not been used in project|is disabled/i.test(e.message));

/** Turns a Google API on for this project (the service account is a project Editor). Returns '' or the problem. */
export async function enableApi(service: string): Promise<string> {
  try {
    const s = await gfetch(`https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${service}`);
    if (s.state === 'ENABLED') return '';
    await gfetch(`https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${service}:enable`, {method: 'POST', body: '{}'});
    logger.info('wh google: enabled API', {service});
    return '';
  } catch (e) {
    logger.warn('wh google: could not enable API', {service, error: errMsg(e)});
    return `Could not turn on ${service} automatically (${errMsg(e)}). Turn it on once here: https://console.cloud.google.com/apis/library/${service}?project=${PROJECT}`;
  }
}

/** Used by the Sheets flush: if Google says the Sheets API is off, turn it on (at most once an hour). */
export async function healSheetsApi(error: string): Promise<boolean> {
  if (!/has not been used in project|SERVICE_DISABLED|is disabled/i.test(error)) return false;
  const ref = db().collection(WH.settings).doc(STATUS_DOC);
  const last = Number((await ref.get()).get('autoEnableAt') || 0);
  if (Date.now() - last < 3600_000) return false;
  await ref.set({autoEnableAt: Date.now()}, {merge: true});
  return (await enableApi('sheets.googleapis.com')) === '';
}

// ---------------------------------------------------------------------------
// Sheets check
// ---------------------------------------------------------------------------

interface SheetUse {spreadsheetId: string; usedBy: Set<string>}

async function sheetsInUse(): Promise<SheetUse[]> {
  const m = new Map<string, SheetUse>();
  const add = (raw: unknown, who: string) => {
    const id = extractSheetId(raw);
    if (!id) return;
    if (!m.has(id)) m.set(id, {spreadsheetId: id, usedBy: new Set()});
    m.get(id)!.usedBy.add(who);
  };
  const [global, domains, flows, hooks, buffer] = await Promise.all([
    db().collection(WH.settings).doc('global').get(),
    db().collection(WH.domains).get(),
    db().collection(WH.flows).get(),
    db().collection(WH.webhooks).get(),
    db().collection(WH.sheetBuffer).limit(2000).get(),
  ]);
  add(global.get('sheetId'), 'All websites (default)');
  domains.docs.forEach((d) => add(d.get('settings.sheetId'), `Website: ${d.get('name') || d.id}`));
  flows.docs.forEach((f) => {
    add(f.get('settings.sheetId'), `Flow: ${f.get('name') || f.id}`);
    for (const s of (f.get('steps') || []) as Array<{type?: string; config?: {spreadsheetId?: string}}>) {
      if (s.type === 'sheets') add(s.config?.spreadsheetId, `Flow: ${f.get('name') || f.id}`);
    }
  });
  hooks.docs.forEach((w) => add(w.get('settings.sheetId'), `Form: ${w.get('formName') || w.id}`));
  buffer.docs.forEach((b) => add(b.get('spreadsheetId'), 'Rows waiting'));
  return Array.from(m.values());
}

async function checkSheets() {
  const apiProblem = await enableApi('sheets.googleapis.com');
  const sheets = [];
  for (const use of await sheetsInUse()) {
    const r: Record<string, unknown> = {spreadsheetId: use.spreadsheetId, usedBy: Array.from(use.usedBy).slice(0, 10), ok: false};
    try {
      const meta = await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(use.spreadsheetId)}?fields=properties.title`);
      r.ok = true;
      r.title = meta.properties?.title || '';
    } catch (e) {
      const status = e instanceof GoogleError ? e.status : 0;
      r.problem = disabledApi(e) ? 'The Google Sheets API is still turning on — try again in a few minutes.' :
        status === 403 ? `Not shared yet: open the sheet → Share → add ${SERVICE_ACCOUNT} as Editor.` :
          status === 404 ? 'Sheet not found — check the link (or it was deleted).' : errMsg(e);
    }
    sheets.push(r);
  }
  // Working sheets: give their failed rows another go right away (the next minute's run writes them).
  let revived = 0;
  const okIds = new Set(sheets.filter((s) => s.ok).map((s) => s.spreadsheetId as string));
  if (okIds.size) {
    const dead = await db().collection(WH.sheetBuffer).where('dead', '==', true).limit(2000).get();
    for (let i = 0; i < dead.docs.length; i += 400) {
      const b = db().batch();
      for (const d of dead.docs.slice(i, i + 400)) {
        if (!okIds.has(String(d.get('spreadsheetId')))) continue;
        b.update(d.ref, {dead: false, attempts: 0, revivedAt: Date.now()});
        revived++;
      }
      await b.commit();
    }
  }
  const allOk = !apiProblem && sheets.every((s) => s.ok);
  const status = {checkedAt: Date.now(), apiProblem, sheets, revived, allOk};
  await db().collection(WH.settings).doc(STATUS_DOC).set({sheetsCheck: status}, {merge: true});
  if (allOk) {
    await db().collection(WH.settings).doc('sheets_status').set(
      {lastError: admin.firestore.FieldValue.delete(), lastErrorAt: admin.firestore.FieldValue.delete()}, {merge: true});
  }
  return status;
}

// ---------------------------------------------------------------------------
// Google Analytics 4
// ---------------------------------------------------------------------------

const hostOf = (u: string) => {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

async function gaList() {
  const apiProblem = await enableApi('analyticsadmin.googleapis.com');
  let summaries: any[] = [];
  let pageToken = '';
  do {
    const r = await gfetch(`${ADMIN_API}/accountSummaries?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`);
    summaries = summaries.concat(r.accountSummaries || []);
    pageToken = r.nextPageToken || '';
  } while (pageToken);
  const domains = await db().collection(WH.domains).get();
  const byHost = new Map(domains.docs.map((d) => [hostOf(String(d.get('url') || '')), d.id]));
  const streams = [];
  for (const acc of summaries) {
    for (const p of acc.propertySummaries || []) {
      const propertyId = String(p.property || '').split('/')[1];
      let list: any[] = [];
      try {
        list = (await gfetch(`${ADMIN_API}/properties/${propertyId}/dataStreams?pageSize=50`)).dataStreams || [];
      } catch (e) {
        logger.warn('wh google: dataStreams failed', {propertyId, error: errMsg(e)});
      }
      for (const s of list) {
        if (s.type !== 'WEB_DATA_STREAM') continue;
        const uri = s.webStreamData?.defaultUri || '';
        streams.push({
          account: acc.displayName || '', propertyId, property: p.displayName || '', streamId: String(s.name || '').split('/').pop(),
          stream: s.displayName || '', measurementId: s.webStreamData?.measurementId || '', uri,
          matchDomainId: byHost.get(hostOf(uri)) || '',
        });
      }
    }
  }
  return {apiProblem, streams, serviceAccount: SERVICE_ACCOUNT};
}

async function ga4Validate(measurementId: string, apiSecret: string) {
  const url = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const res = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({client_id: '1.1', events: [{name: 'tigon_connection_test', params: {engagement_time_msec: 1}}]})});
  if (!res.ok) return `Google Analytics answered HTTP ${res.status}.`;
  const j = await res.json().catch(() => ({}));
  const m = (j.validationMessages || [])[0];
  return m ? String(m.description || 'Google Analytics rejected the test event.') : '';
}

async function saveGa(domainId: string, values: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) patch[k] = v === undefined ? admin.firestore.FieldValue.delete() : v;
  if (domainId) {
    const ref = db().collection(WH.domains).doc(domainId);
    if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Website not found.');
    await ref.set({settings: patch, updatedAt: Date.now()}, {merge: true});
  } else {
    await db().collection(WH.settings).doc('global').set({...patch, updatedAt: Date.now()}, {merge: true});
  }
  clearConfigCache();
}

async function gaConnect(domainId: string, propertyId: string, streamId: string, acknowledge: boolean) {
  if (!/^\d+$/.test(propertyId) || !/^\d+$/.test(streamId)) throw new HttpsError('invalid-argument', 'Pick a property and stream.');
  const base = `${ADMIN_API}/properties/${propertyId}/dataStreams/${streamId}`;
  const stream = await gfetch(base);
  const measurementId = stream.webStreamData?.measurementId;
  if (!measurementId) throw new HttpsError('failed-precondition', 'That is not a web data stream.');
  const existing = ((await gfetch(`${base}/measurementProtocolSecrets`)).measurementProtocolSecrets || []) as any[];
  let secret = existing.find((s) => s.displayName === 'TIGON IOT') || existing[0];
  if (!secret) {
    try {
      secret = await gfetch(`${base}/measurementProtocolSecrets`, {method: 'POST', body: JSON.stringify({displayName: 'TIGON IOT'})});
    } catch (e) {
      if (!acknowledge) {
        throw new HttpsError('failed-precondition', 'NEEDS_ACK: Google asks you to confirm the data-collection terms once for this property.');
      }
      await gfetch(`${ADMIN_API}/properties/${propertyId}:acknowledgeUserDataCollection`, {method: 'POST', body: JSON.stringify({acknowledgement: GA_ACK})});
      secret = await gfetch(`${base}/measurementProtocolSecrets`, {method: 'POST', body: JSON.stringify({displayName: 'TIGON IOT'})});
      logger.info('wh google: acknowledged GA user data collection', {propertyId, after: errMsg(e)});
    }
  }
  const problem = await ga4Validate(measurementId, secret.secretValue);
  await saveGa(domainId, {
    ga4MeasurementId: measurementId, ga4ApiSecret: secret.secretValue,
    ga4Property: `${stream.displayName || measurementId} (property ${propertyId})`, ga4ConnectedAt: Date.now(),
  });
  return {measurementId, problem};
}

export const whGoogle = onCall({timeoutSeconds: 300, memory: '512MiB'}, async (req) => {
  const caller = await requireManager(req, true);
  const d = (req.data || {}) as Record<string, unknown>;
  const action = String(d.action || '');
  const domainId = String(d.domainId || '');
  if (domainId && !/^[A-Za-z0-9_-]{1,128}$/.test(domainId)) throw new HttpsError('invalid-argument', 'Bad website id.');
  const audit = (what: string) => db().collection('mp_audit').add({actorUid: caller.uid, actorName: caller.name, action: 'wh_google', target: domainId || 'global', details: what, ts: Date.now()});
  try {
    switch (action) {
      case 'check':
        return await checkSheets();
      case 'gaList':
        return await gaList();
      case 'gaConnect': {
        const r = await gaConnect(domainId, String(d.propertyId || ''), String(d.streamId || ''), d.acknowledge === true);
        await audit(`GA4 connected: ${r.measurementId}`);
        return r;
      }
      case 'gaManual': {
        const measurementId = String(d.measurementId || '').trim().toUpperCase();
        const apiSecret = String(d.apiSecret || '').trim();
        if (!/^G-[A-Z0-9]{4,20}$/.test(measurementId)) throw new HttpsError('invalid-argument', 'The Measurement ID looks like G-XXXXXXX.');
        if (!/^[A-Za-z0-9_-]{8,100}$/.test(apiSecret)) throw new HttpsError('invalid-argument', 'Paste the API secret value from Google Analytics.');
        const problem = await ga4Validate(measurementId, apiSecret);
        await saveGa(domainId, {ga4MeasurementId: measurementId, ga4ApiSecret: apiSecret, ga4Property: measurementId, ga4ConnectedAt: Date.now()});
        await audit(`GA4 set by hand: ${measurementId}`);
        return {measurementId, problem};
      }
      case 'gaDisconnect':
        await saveGa(domainId, {ga4MeasurementId: undefined, ga4ApiSecret: undefined, ga4Property: undefined, ga4ConnectedAt: undefined});
        await audit('GA4 disconnected');
        return {ok: true};
      default:
        throw new HttpsError('invalid-argument', 'Unknown action.');
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const msg = errMsg(e);
    logger.warn('wh google failed', {action, error: msg});
    if (e instanceof GoogleError && e.status === 403 && action.startsWith('ga')) {
      throw new HttpsError('permission-denied', `Google Analytics refused (${msg}). Add ${SERVICE_ACCOUNT} as an Editor on that Analytics account (Admin → Account access management), then try again.`);
    }
    throw new HttpsError('internal', msg);
  }
});
