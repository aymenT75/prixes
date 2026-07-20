# Prixes — Native iOS & Android (Capacitor)

The native apps reuse the Next.js app: a **static export** (`out/`) is bundled inside a
Capacitor shell and talks to the live API (`https://prixes.omnilink.software`) over HTTPS.
Native plugins provide barcode scanning, geolocation, speech, haptics, share, camera,
push notifications and native Google/Apple sign-in. On the web everything falls back to
the existing Web APIs.

App id: `software.omnilink.prixes` · App name: `Prixes`

---

## Prerequisites

- **Node** ≥ 20, **npm** ≥ 10.
- **Android**: Android Studio + **JDK 21** (Capacitor 8 compiles against Java 21;
  JDK 17 fails the Gradle build). Works on Windows/macOS/Linux.
- **iOS**: a **Mac** with Xcode + CocoaPods (`sudo gem install cocoapods`).
- **Apple Developer Program** ($99/yr) and **Google Play Developer** ($25 once).
- **Firebase project** `prixes-b07fb`:
  - Auth → enable **Google** and **Apple** providers.
  - Add an **Android app** (package `software.omnilink.prixes`) → download
    `google-services.json` → place in `android/app/`.
  - Add an **iOS app** (bundle `software.omnilink.prixes`) → download
    `GoogleService-Info.plist` → add to `ios/App/App/` in Xcode.
  - Cloud Messaging → upload the **APNs auth key** (`.p8`) for iOS push.
  - Create a **service account** (Project settings → Service accounts → generate key)
    for the backend to send FCM (see backend section).

## Everyday workflow

```bash
# from apps/web
npm run build:mobile     # static export → out/ (uses .env.mobile: prod API URL)
npm run cap:sync         # build:mobile + copy into ios/ and android/
npm run cap:android      # build + sync + open Android Studio
npm run cap:ios          # build + sync + open Xcode (on the Mac)
```

Live reload during development (device on same network):

```bash
CAP_SERVER_URL=http://<your-lan-ip>:3000 npx cap run android   # never ship this
```

Regenerate icons/splash after changing `assets/logo.png` (drop a real 1024×1024 master
there first — the current one is upscaled from the 512 PWA icon):

```bash
npm run cap:assets
```

> Note: `capacitor-assets` also rewrites `public/manifest.json` with relative webp icon
> paths that break the web PWA. After running it, revert that file
> (`git checkout -- public/manifest.json`) — only the native `ios/`/`android/` icons are
> wanted from that command.

---

## Native features → plugins

| Feature | Plugin | Notes |
|---|---|---|
| Barcode scan | `@capacitor-mlkit/barcode-scanning` | native scanner; web keeps ZXing |
| Geolocation | `@capacitor/geolocation` | fuel page |
| Speech (STT/TTS) | `@capacitor-community/speech-recognition` + `text-to-speech` | required on iOS (no Web Speech in WKWebView) |
| Haptics | `@capacitor/haptics` | |
| Share | `@capacitor/share` | |
| Camera | `@capacitor/camera` | deal photo |
| Push | `@capacitor/push-notifications` | FCM/APNs |
| Auth | `@capacitor-firebase/authentication` | native Google/Apple → Firebase ID token → `/auth/firebase` |
| Shell | `@capacitor/app`, `status-bar`, `splash-screen` | back button, status bar, splash |

Native vs web is chosen at runtime by `src/lib/platform.ts` (`isNativeApp()`).

### iOS Swift Package Manager caveat
Capacitor 8 iOS uses SPM by default. Two plugins (`@capacitor-mlkit/barcode-scanning`,
`@capacitor-community/speech-recognition`) don't yet ship `Package.swift`. If the Xcode
build can't resolve them via SPM, switch the iOS project to **CocoaPods**
(`npx cap add ios` after setting `"ios": { "packageManager": "Cocoapods" }` equivalent, or
regenerate with the `--packagemanager Cocoapods` flag) — all plugins provide podspecs.

---

## Backend (already wired)

- **CORS**: the Capacitor origins (`capacitor://localhost`, `https://localhost`, …) are
  always allowed — see `apps/api/app/core/config.py`.
- **Auth**: native Google **and** Apple both produce a Firebase ID token exchanged at
  `POST /api/v1/auth/firebase` — no new endpoint needed. Just enable the providers in
  Firebase.
- **Push**: new `devices` table + `POST/DELETE /api/v1/devices`; the alert worker
  (`evaluate_price_alerts`) sends FCM via `app/domains/notifications/push.py`. Configure:
  ```
  FIREBASE_SERVICE_ACCOUNT_FILE=/run/secrets/fcm-service-account.json
  ```
  Run the migration: `alembic upgrade head` (adds `devices`, revision `0005_devices`).

---

## Deep links (App Links / Universal Links)

- Android manifest already declares an `autoVerify` intent filter for
  `https://prixes.omnilink.software`. Host `/.well-known/assetlinks.json` on the domain
  with the app's SHA-256 signing fingerprint to enable verified App Links.
- iOS: add the **Associated Domains** capability (`applinks:prixes.omnilink.software`) in
  Xcode and host `/.well-known/apple-app-site-association`.
- Price-alert push taps deep-link to the product in-app via the notification `data.barcode`
  (handled in `src/lib/push.ts` → `/courses/detail?barcode=…`).

---

## Store submission

**Apple (App Store Connect)** — create the app (bundle `software.omnilink.prixes`),
enable **Sign in with Apple** + **Push Notifications** capabilities in Xcode, archive and
upload via Xcode/Transporter. Fill Privacy "nutrition labels" (location, identifiers for
push), provide a reviewer demo account, screenshots (6.7", 6.5", 5.5").

**Google (Play Console)** — upload a signed **AAB**, complete the **Data Safety** form
(location, device token), content rating, screenshots + feature graphic, target the
current API level. Start on the **internal testing** track before production.
