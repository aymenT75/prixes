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
      launchShowDuration: 700,
      backgroundColor: "#faf9f5",
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
