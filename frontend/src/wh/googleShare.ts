// "Share it for me": the person signs in with the Google account that owns the sheet (a popup, in a separate
// Firebase app so their TIGON IOT sign-in is untouched) and TIGON IOT adds the robot account as an Editor through
// the Drive API. The share is permanent, so nothing is stored and nothing can expire afterwards.
import { getApp, getApps, initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut } from 'firebase/auth';

export const ROBOT = '470095494000-compute@developer.gserviceaccount.com';
const PROJECT = 'tigon-iot';
export const GOOGLE_PROVIDER_URL = `https://console.firebase.google.com/project/${PROJECT}/authentication/providers`;
export const AUTH_DOMAINS_URL = `https://console.firebase.google.com/project/${PROJECT}/authentication/settings`;
const DRIVE_API_URL = `https://console.cloud.google.com/apis/library/drive.googleapis.com?project=${PROJECT}`;

export interface ShareResult { account: string; shared: string[]; failed: Array<{ id: string; error: string }> }

/** A spreadsheet id inside any text (e.g. "Last problem: 1YVq…/DBA LEADS: No access…"). */
export const sheetIdsIn = (text: string | undefined) => Array.from(new Set((text || '').match(/\b[a-zA-Z0-9_-]{40,50}\b/g) || []));

function shareApp() {
  const name = 'google-share';
  return getApps().find((a) => a.name === name) || initializeApp(getApp().options, name);
}

function popupError(e: unknown): string {
  const code = (e as { code?: string })?.code || '';
  if (code === 'auth/operation-not-allowed') {
    return `Google sign-in is switched off for TIGON IOT. Turn it on once: open ${GOOGLE_PROVIDER_URL} → Add new provider → Google → Enable → Save, then press "Share it for me" again.`;
  }
  if (code === 'auth/unauthorized-domain') return `This web address isn't allowed for Google sign-in yet. Add ${window.location.hostname} under Authorized domains: ${AUTH_DOMAINS_URL}`;
  if (code === 'auth/popup-blocked') return 'The browser blocked the Google window. Allow pop-ups for this site and press the button again.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'The Google window was closed before signing in.';
  return e instanceof Error ? e.message : String(e);
}

function driveError(status: number, body: string): string {
  let reason = '';
  let message = body.slice(0, 200);
  try {
    const j = JSON.parse(body);
    reason = j.error?.errors?.[0]?.reason || j.error?.status || '';
    message = j.error?.message || message;
  } catch { /* not JSON */ }
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(`${reason} ${message}`)) {
    return `The Google Drive API is still turning on — wait a minute and try again (or turn it on here: ${DRIVE_API_URL}).`;
  }
  if (/shareOutNotPermitted|publishOutNotPermitted|cannotShare|sharingRateLimitExceeded/i.test(reason) || /outside|domain policy/i.test(message)) {
    return `Your Google Workspace blocks sharing outside the company. A Workspace admin can allow it in admin.google.com → Apps → Google Workspace → Drive and Docs → Sharing settings (allow sharing outside, or add gserviceaccount.com to the allowlist). Google said: ${message}`;
  }
  if (status === 404) return 'That Google account cannot see this sheet. Sign in with the account that owns it.';
  if (status === 403) return `That Google account cannot share this sheet (${message}). Sign in with the sheet's owner or an Editor allowed to share.`;
  return `Google said ${status}: ${message}`;
}

/** Opens the Google popup (call straight from a click) and shares each sheet with the robot as Editor. */
export async function shareSheetsWithRobot(ids: string[]): Promise<ShareResult> {
  const auth = getAuth(shareApp());
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive');
  provider.setCustomParameters({ prompt: 'select_account' });
  let token = '';
  let account = '';
  try {
    const cred = await signInWithPopup(auth, provider);
    token = GoogleAuthProvider.credentialFromResult(cred)?.accessToken || '';
    account = cred.user.email || '';
  } catch (e) {
    throw new Error(popupError(e));
  }
  if (!token) throw new Error('Google did not give permission to share. Try again and tick the Google Drive box.');
  const out: ShareResult = { account, shared: [], failed: [] };
  try {
    for (const id of ids) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: ROBOT }) },
      );
      if (res.ok) out.shared.push(id);
      else out.failed.push({ id, error: driveError(res.status, await res.text()) });
    }
  } finally {
    await signOut(auth).catch(() => undefined);
  }
  return out;
}
