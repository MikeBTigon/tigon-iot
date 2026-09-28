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
