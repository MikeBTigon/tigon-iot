// Push alerts for the TIGON IOT phone app. Registering makes this phone a "master"
// device, so onNotificationCreate sends it an FCM push for every new notification.
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { nativePlatform } from './platform';

const INSTALL_KEY = 'tigon.installId';

function installId(): string {
  let id = '';
  try {
    id = localStorage.getItem(INSTALL_KEY) || '';
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(INSTALL_KEY, id);
    }
  } catch {
    id = id || 'unknown';
  }
  return id;
}

/** One device doc per app install + user, so a shared phone never reuses another user's doc. */
const deviceRef = (uid: string) => doc(db, 'devices', `app_${installId()}_${uid}`);

export async function isPhoneAlertsOn(uid: string): Promise<boolean> {
  const snap = await getDoc(deviceRef(uid));
  return snap.exists() && snap.get('isActive') === true;
}

export async function enablePhoneAlerts(uid: string, deviceName: string): Promise<void> {
  const perm = await FirebaseMessaging.requestPermissions();
  if (perm.receive !== 'granted') {
    throw new Error('Notifications are blocked for TIGON IOT. Turn them on in your phone Settings, then try again.');
  }
  const { token } = await FirebaseMessaging.getToken();
  await setDoc(
    deviceRef(uid),
    {
      userId: uid,
      deviceName,
      deviceType: 'master',
      isActive: true,
      fcmToken: token,
      platform: nativePlatform(),
      source: 'tigon-iot-app',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function disablePhoneAlerts(uid: string): Promise<void> {
  const ref = deviceRef(uid);
  if ((await getDoc(ref)).exists()) await updateDoc(ref, { isActive: false, updatedAt: serverTimestamp() });
}

/** Keeps the stored token fresh and opens the dashboard when an alert is tapped. */
export async function initPushListeners(getUid: () => string | undefined, openDashboard: () => void) {
  await FirebaseMessaging.addListener('tokenReceived', async ({ token }) => {
    const uid = getUid();
    if (!uid) return;
    const ref = deviceRef(uid);
    if ((await getDoc(ref)).exists()) await updateDoc(ref, { fcmToken: token, updatedAt: serverTimestamp() });
  });
  await FirebaseMessaging.addListener('notificationActionPerformed', () => openDashboard());
}
