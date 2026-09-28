# TIGON IOT phone apps (iPhone + Android)

One app for both platforms, built from the same code as the website (Capacitor wraps `frontend/`).
Everything on the website is in the app — IoT dashboard, devices, settings, and the MP Assistant —
plus phone-only features:

| Feature | How it works in the app |
|---|---|
| **Push alerts** | Dashboard / Devices → **Alerts on this phone → Turn on**. The phone registers as a *master* device, so it gets a push for every new notification from worker phones. Tapping an alert opens the dashboard. Signing out turns alerts off for that phone. |
| **Save photos** | "Save" / "Save all" in MP Assistant opens the share sheet → **Save Image(s)** puts them straight into the photo library. |
| **Phone layout** | Content stays clear of the notch / status bar; Android back button works. |
| **Pair with QR** | Sign-in screen → **Scan pairing QR code** (or type the 8-character code) from Devices → Pair a phone on a computer. Signs in automatically. |
| **Prepare listing** | 3 taps: save photos → copy listing & open Marketplace → "I published it". |
| **Posting queue pushes** | Carts sent with **Auto Post** arrive as "Ready to post" notifications; tap to prepare. |
| **Quick actions** | Long-press the app icon: Next cart to post · My posting queue · Notifications. |
| **Heartbeat** | While open, the phone reports online status and active time (Analytics, Team phones). A revoked phone signs out. |

> The app does **not** forward notifications (worker role). iPhones can't read other apps' notifications
> at all, so worker phones keep using the existing Android IoT app.

- App ID (both platforms): `com.tigongolfcarts.iot` · App name: **TIGON IOT**
- Native projects: `frontend/android/` (Android Studio) and `frontend/ios/` (Xcode, Swift Package Manager)
- Icons / splash sources: `frontend/assets/` (regenerate with `npx @capacitor/assets generate`)

## Getting the Android app (no store needed)

Every push that changes `frontend/` builds it automatically:

1. GitHub → **Actions → Build phone apps** → open the latest green run.
2. Under **Artifacts**, download **tigon-iot-android-apk** (a .zip containing `app-debug.apk`).
3. Send the APK to a phone, open it, allow "Install unknown apps", install.

## Turning on push alerts (one time, Firebase console)

Push alerts need each app registered in Firebase (project **tigon-iot**):

**Android**
1. Firebase console → Project settings → **Add app → Android**, package name `com.tigongolfcarts.iot` → Register.
2. Download **google-services.json**.
3. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**:
   name `GOOGLE_SERVICES_JSON`, value = the whole file's contents. The next build includes it.

**iOS** (needs the Apple Developer account)
1. Firebase console → **Add app → iOS**, bundle ID `com.tigongolfcarts.iot` → download **GoogleService-Info.plist**.
2. Apple Developer → Keys → create an **APNs key** → upload it in Firebase → Project settings → Cloud Messaging → Apple app.
3. Add the plist to the Xcode project (drag into `App/App`, "Copy items if needed"), and in Xcode →
   Signing & Capabilities add **Push Notifications** and **Background Modes → Remote notifications**.

## Publishing the iPhone app

Requires an **Apple Developer Program** membership ($99/year, enroll as the company) and a Mac with Xcode
(or a hosted Mac build service).

1. On the Mac: `git clone …`, then `cd frontend && npm ci && npm run build && npx cap sync ios && npx cap open ios`.
2. In Xcode: select the **App** target → Signing & Capabilities → choose your team (bundle ID `com.tigongolfcarts.iot`).
3. **Product → Archive → Distribute App → App Store Connect** → then add testers in **TestFlight**
   (internal testers can install within minutes; public App Store listing needs Apple review).

## Publishing the Android app on Google Play (optional)

The APK above is enough for staff. For Google Play: create a Play Console account ($25 one-time),
create an upload keystore, build a signed release bundle (`./gradlew bundleRelease` with signing config),
and upload it to an internal testing track.

## Updating the app

Website changes show up in the app after the app is rebuilt (the web code is bundled inside it).
For staff installs, just download the newest APK from Actions; for TestFlight, archive a new build.

## Developer notes

- `npm run build && npx cap sync` after changing web code; `npx cap open android|ios` to run on a device.
- Phone-only code lives in `src/native/` and is guarded by `isNativeApp()`, so the website is unaffected.
- CI: `.github/workflows/mobile-build.yml` (Android APK + iOS simulator compile check).
