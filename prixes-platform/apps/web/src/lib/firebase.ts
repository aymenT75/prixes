// Firebase Auth (identity provider). The web config below is public by design —
// these are project identifiers, not secrets. Access is controlled by Firebase
// Auth rules + our backend verifying the ID token. Env vars override if set.
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyDrDQSlFbnRACznBYiIlXZVfnmUDKy1T3E",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "prixes-b07fb.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "prixes-b07fb",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "prixes-b07fb.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "469759036890",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:469759036890:web:4e1f4a8ac33b5862ac04e3",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-FFNB8WJ97D",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Native (Capacitor) social sign-in. `signInWithPopup` is a browser concept that does
// not work in a webview, so on device we use @capacitor-firebase/authentication to run
// the native Google/Apple flow. It signs into the native Firebase SDK, then we read the
// resulting Firebase ID token and exchange it via the same /auth/firebase endpoint the
// web uses — so Apple needs no dedicated backend, just the Apple provider enabled in
// the Firebase console.
export async function nativeSignIn(provider: "google" | "apple"): Promise<string> {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  if (provider === "google") {
    await FirebaseAuthentication.signInWithGoogle();
  } else {
    await FirebaseAuthentication.signInWithApple();
  }
  const { token } = await FirebaseAuthentication.getIdToken();
  if (!token) throw new Error("no-token");
  return token;
}
