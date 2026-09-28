import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { useAuth } from '../context/AuthContext';
import { isNativeApp } from './platform';
import { ensurePushToken, initPushListeners } from './phoneAlerts';
import { endDeviceSession, logEvent, registerDevice, startHeartbeat } from './deviceSession';

/** Home-screen quick actions (ids match capacitor.config.ts AppShortcuts) → in-app routes. */
const SHORTCUT_ROUTES: Record<string, string> = {
  next: '/mp',
  new: '/mp/new',
  queue: '/mp/queue',
  leads: '/mp/leads',
  dashboard: '/dashboard',
};

/**
 * Phone-app-only wiring (renders nothing): device registration + heartbeat, push taps,
 * home-screen quick actions and the Android back button.
 */
export default function NativeBridge() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const uidRef = useRef<string | undefined>(undefined);
  const uid = currentUser?.uid;

  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);

  // App-wide listeners.
  useEffect(() => {
    if (!isNativeApp()) return;
    const back = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else CapApp.exitApp();
    });
    initPushListeners(
      () => uidRef.current,
      (data) => navigate(data.type === 'mp_queue' && data.queueId ? `/mp/post/${data.queueId}` : '/dashboard'),
    ).catch((e) => console.warn('Push setup unavailable', e));
    let shortcuts: Promise<{ remove: () => Promise<void> }> | null = null;
    import('@capawesome/capacitor-app-shortcuts')
      .then(({ AppShortcuts }) => {
        shortcuts = AppShortcuts.addListener('click', ({ shortcutId }) => navigate(SHORTCUT_ROUTES[shortcutId] || '/dashboard'));
      })
      .catch((e) => console.warn('App shortcuts unavailable', e));
    return () => {
      back.then((h) => h.remove());
      shortcuts?.then((h) => h.remove());
    };
  }, [navigate]);

  // Per-user device session: register, push token, heartbeat, revocation.
  useEffect(() => {
    if (!isNativeApp() || !currentUser) return;
    let stop = () => undefined as void;
    let cancelled = false;
    (async () => {
      try {
        await registerDevice(currentUser.uid, currentUser.email);
      } catch (e) {
        console.warn('Device registration failed', e);
        return;
      }
      if (cancelled) return;
      await ensurePushToken(currentUser.uid);
      logEvent(currentUser.uid, 'app_open');
      stop = startHeartbeat(currentUser.uid, async (state) => {
        alert(state === 'revoked'
          ? 'This phone was removed from TIGON IOT by a manager. You have been signed out.'
          : 'This phone was moved to another person. Pair it again to sign in.');
        await logout();
        navigate('/login');
      });
    })();
    return () => {
      cancelled = true;
      stop();
      endDeviceSession();
    };
  }, [currentUser, logout, navigate]);

  return null;
}
