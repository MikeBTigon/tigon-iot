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
    // Long-press the app icon for these quick actions ("hotkeys").
    AppShortcuts: {
      shortcuts: [
        { id: 'next', title: 'Next cart to post', description: 'Suggested carts', iosIcon: 'car.fill' },
        { id: 'queue', title: 'My posting queue', description: 'Carts assigned to you', iosIcon: 'list.bullet' },
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
