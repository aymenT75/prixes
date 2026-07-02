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
