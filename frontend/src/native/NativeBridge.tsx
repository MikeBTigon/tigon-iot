import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { useAuth } from '../context/AuthContext';
import { isNativeApp } from './platform';
import { initPushListeners } from './phoneAlerts';

/** Phone-app-only wiring: Android back button and push-alert taps. Renders nothing. */
export default function NativeBridge() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const uidRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    uidRef.current = currentUser?.uid;
  }, [currentUser]);

  useEffect(() => {
    if (!isNativeApp()) return;
    const back = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else CapApp.exitApp();
    });
    initPushListeners(() => uidRef.current, () => navigate('/dashboard')).catch((e) =>
      console.warn('Push setup unavailable', e),
    );
    return () => {
      back.then((h) => h.remove());
    };
  }, [navigate]);

  return null;
}
