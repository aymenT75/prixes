import type { CapacitorConfig } from "@capacitor/cli";

// Dev-only live reload: `CAP_SERVER_URL=http://<your-ip>:3000 npx cap run android`.
// Never set this for a store build — production ships the bundled `out/` assets.
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "software.omnilink.prixes",
  appName: "Prixes",
  webDir: "out",
  server: {
    androidScheme: "https",
    ...(devServerUrl ? { url: devServerUrl, cleartext: true } : {}),
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      // The native splash hands over to the in-app boot overlay (<BootScreen/>),
      // which looks identical and stays up until the UI has actually settled — so
      // the splash is hidden explicitly rather than on a fixed timer. The duration
      // below is only a failsafe for a bundle that never boots at all.
      launchShowDuration: 3000,
      launchFadeOutDuration: 200,
      // Same off-white as the boot overlay and the launch screen drawable.
      backgroundColor: "#FDFDFD",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    FirebaseAuthentication: {
      // Sign in natively so getIdToken() returns a Firebase ID token we exchange
      // with the backend /auth/firebase endpoint.
      skipNativeAuth: false,
      providers: ["google.com", "apple.com"],
    },
  },
};

export default config;
