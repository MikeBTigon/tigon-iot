// Push alerts for the TIGON IOT phone app. Registering makes this phone a "master"
// device, so onNotificationCreate sends it an FCM push for every new notification.
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { nativePlatform } from './platform';
import { deviceRef, installId } from './deviceSession';

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
      installId: installId(),
      status: 'active',
      lastSeen: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function disablePhoneAlerts(uid: string): Promise<void> {
  const ref = deviceRef(uid);
  if ((await getDoc(ref)).exists()) await updateDoc(ref, { isActive: false, updatedAt: serverTimestamp() });
}

/** Keeps the stored token fresh and routes taps on pushes (queue items open their prepare screen). */
export async function initPushListeners(getUid: () => string | undefined, onOpen: (data: Record<string, string>) => void) {
  await FirebaseMessaging.addListener('tokenReceived', async ({ token }) => {
    const uid = getUid();
    if (!uid) return;
    const ref = deviceRef(uid);
    if ((await getDoc(ref)).exists()) await updateDoc(ref, { fcmToken: token, updatedAt: serverTimestamp() });
  });
  await FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) =>
    onOpen((notification?.data || {}) as Record<string, string>),
  );
}

/**
 * Stores this phone's push token without turning IoT alerts on, so the posting queue can
 * send "ready to publish" pushes. Asks for notification permission the first time.
 */
export async function ensurePushToken(uid: string): Promise<boolean> {
  try {
    const perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== 'granted') return false;
    const { token } = await FirebaseMessaging.getToken();
    await updateDoc(deviceRef(uid), { fcmToken: token, updatedAt: serverTimestamp() });
    return true;
  } catch (e) {
    console.warn('Push token unavailable', e);
    return false;
  }
}
