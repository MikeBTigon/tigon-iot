import { Capacitor } from '@capacitor/core';

/** True inside the TIGON IOT iPhone/Android app, false in a web browser. */
export const isNativeApp = () => Capacitor.isNativePlatform();

export const nativePlatform = () => Capacitor.getPlatform() as 'ios' | 'android' | 'web';
