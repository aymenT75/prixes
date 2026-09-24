# Prixes — Native iOS & Android (Capacitor)

The native apps reuse the Next.js app: a **static export** (`out/`) is bundled inside a
Capacitor shell and talks to the live API (`https://prixes.app`) over HTTPS.
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
    `GoogleService-Info.plist` → `ios/App/App/` (done, committed).
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
| Camera | `@capacitor/camera` | product photo recognition |
| Push | `@capacitor/push-notifications` | FCM/APNs |
| Auth | `@capacitor-firebase/authentication` | native Google/Apple → Firebase ID token → `/auth/firebase` |
| Shell | `@capacitor/app`, `status-bar`, `splash-screen` | back button, status bar, splash |

Native vs web is chosen at runtime by `src/lib/platform.ts` (`isNativeApp()`).

### iOS uses CocoaPods, not Swift Package Manager
Capacitor 8 creates iOS projects with SPM, and two plugins
(`@capacitor-mlkit/barcode-scanning`, `@capacitor-community/speech-recognition`) have no
`Package.swift`: the first iOS project was silently built **without the scanner and the
voice assistant**, and generated on Windows with `..\..\` paths no Mac could read. It was
regenerated on 2026-09-21 with `npx cap add ios --packagemanager CocoaPods` (13 plugins).
Hand-made changes that a regeneration would lose — redo them if `ios/` is ever recreated:

- `Podfile`, in `target 'App'`: `CapacitorFirebaseAuthentication/Google` (without it,
  Google sign-in fails on iPhone) and `FirebaseMessaging`.
- `AppDelegate.swift`: `FirebaseApp.configure()` and the push callbacks that swap the
  APNs token for an **FCM token** — the backend sends through FCM, so an APNs token
  would never receive a price alert.
- `App/App.entitlements` (push + Sign in with Apple), referenced by
  `CODE_SIGN_ENTITLEMENTS`; `GoogleService-Info.plist` in the Resources phase;
  `TARGETED_DEVICE_FAMILY = 1` (iPhone only: no iPad screenshots or iPad review).
- `Info.plist`: permission texts, `ITSAppUsesNonExemptEncryption = false`,
  `UIBackgroundModes = remote-notification`, and the Google sign-in URL scheme
  (`CFBundleURLTypes` = the plist's `REVERSED_CLIENT_ID` — change both together).
- `IPHONEOS_DEPLOYMENT_TARGET` and the Podfile `platform` at **15.5**, not 15.0: Google
  ML Kit 8 (the scanner) refuses anything lower and `pod install` fails.

`ios/App/App/GoogleService-Info.plist` (Firebase iOS app
`1:469759036890:ios:fd13f63cc0e247efac04e3`) is **in the repository**, like
`google-services.json` for Android: Firebase client configuration is not a secret, and
its API key only works for this bundle id.

### Compile check without an Apple account
`.github/workflows/ios-build.yml` builds the app for the simulator, unsigned, on a
GitHub macOS runner (free: the repository is public) on every push to `main` touching
the app. It proves pods, plugins and Swift compile; only signing, real push and Sign in
with Apple are left for the first Codemagic build.

### État iOS au 2026-09-24 (version 1.6)

`MARKETING_VERSION` passé de 1.0 à **1.6**, pour coller à Android 1.6 (versionCode 7).
`CURRENT_PROJECT_VERSION` reste à 1 : Codemagic l'écrase avec son compteur `$BUILD_NUMBER`
à chaque build (étape « Build number » de `codemagic.yaml`), il n'y a rien à incrémenter
à la main.

Configuration vérifiée ce jour, sans Mac :

| Point | État |
|---|---|
| `appId` cohérent (capacitor.config / pbxproj / GoogleService-Info) | ✅ `software.omnilink.prixes` |
| `CFBundleURLSchemes` = `REVERSED_CLIENT_ID` | ✅ identiques |
| 5 `*UsageDescription` en français (caméra, micro, parole, position, photos) | ✅ |
| Entitlements `aps-environment` + Sign in with Apple | ✅ |
| Podfile : `platform :ios, '15.5'`, sous-spec `.../Google`, FirebaseMessaging ~> 12.7 | ✅ |
| `FirebaseApp.configure()` + relais APNs → FCM dans AppDelegate | ✅ |
| API embarquée | ✅ `https://prixes.app`, aucun `localhost` |
| `Podfile.lock` / `Pods/` | ❌ absents — `pod install` n'a jamais tourné (Windows) |
| `AppIcon.appiconset` | ⚠️ une seule image `AppIcon-512@2x.png` |

Les deux derniers ne se règlent qu'au premier build sur un Mac (ou sur Codemagic).
Aucune dépendance native n'est figée tant que `Podfile.lock` n'existe pas : le premier
build résout les versions et peut donc surprendre.

⚠️ `ios/App/App/public` est **gitignoré** et régénéré par `npx cap sync ios` : le dossier
présent en local peut dater d'avant le dernier correctif. Codemagic le reconstruit à
chaque fois, il n'y a rien à committer.

### Building iOS without a Mac: Codemagic
`codemagic.yaml` (repo root) builds on a cloud Mac and uploads to TestFlight. It checks
the Firebase plist belongs to this app and matches the URL scheme, and numbers each
build. Started by hand from the dashboard.

One-time setup, in this order:

1. **Apple Developer Program** (99 $/year) — the account holder signs up.
2. **Identifiers** → App ID `software.omnilink.prixes`, capabilities **Push
   Notifications** and **Sign In with Apple**.
3. **Keys** → an APNs key (`.p8`) → upload it in Firebase → Project settings → Cloud
   Messaging → Apple app configuration.
4. **App Store Connect** → create the app with that bundle id; **Users and Access →
   Integrations** → an API key (role App Manager) — keep the `.p8`, it downloads once.
5. **Firebase** → ~~add an iOS app~~ (done 2026-09-21, plist committed);
   Authentication → enable **Apple**.
6. **Codemagic** → add the repo; Team settings → Integrations → App Store Connect → the
   API key, **named `Prixes ASC`**; Code signing identities → generate an *Apple
   Distribution* certificate. No environment variable is needed.
7. Start the **ios-testflight** workflow. The build lands in TestFlight about 15 minutes
   after the upload, once Apple has processed it.

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
  `https://prixes.app`. Host `/.well-known/assetlinks.json` on the domain
  with the app's SHA-256 signing fingerprint to enable verified App Links.
- iOS: add the **Associated Domains** capability (`applinks:prixes.app`) in
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
