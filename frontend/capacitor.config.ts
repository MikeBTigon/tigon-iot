import type { CapacitorConfig } from '@capacitor/cli';

// Native iOS/Android shell for the TIGON IOT web app (dashboard + MP Assistant).
// Build the web app first (`npm run build`), then `npx cap sync`.
const config: CapacitorConfig = {
  appId: 'com.tigongolfcarts.iot',
  appName: 'TIGON IOT',
  webDir: 'dist',
  ios: {
    // Content draws edge-to-edge; the layout pads itself with env(safe-area-inset-*).
    contentInset: 'never',
  },
  // Avoids a SwiftPM package identity collision with the Firebase SDK.
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          '@capacitor-firebase/messaging': { symlink: true },
        },
      },
    },
  },
  plugins: {
    // Long-press the app icon for these quick actions ("hotkeys"). Routes: native/NativeBridge.tsx SHORTCUT_ROUTES.
    // Android launchers show at most 4–5; keep this list short.
    AppShortcuts: {
      shortcuts: [
        { id: 'next', title: 'Next cart to post', description: 'Suggested carts', iosIcon: 'car.fill' },
        { id: 'new', title: 'New listing', description: 'Snap-to-list', iosIcon: 'camera.fill' },
        { id: 'queue', title: 'My queue', description: 'Carts assigned to you', iosIcon: 'list.bullet' },
        { id: 'leads', title: 'Leads', description: 'Follow-ups due', iosIcon: 'person.2.fill' },
        { id: 'dashboard', title: 'Notifications', description: 'IoT dashboard', iosIcon: 'bell.fill' },
      ],
    },
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
