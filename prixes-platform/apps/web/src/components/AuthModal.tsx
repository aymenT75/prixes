"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { LogoMark } from "@/components/Logo";
import { api } from "@/lib/api";
import { auth, googleProvider, nativeSignIn } from "@/lib/firebase";
import { isNativeApp, nativePlatform } from "@/lib/platform";
import { useApp } from "@/lib/store";
import { tokenStore } from "@/lib/tokens";
import { useDialog } from "@/lib/useDialog";

// Map Firebase error codes to friendly French messages.
function frError(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email ou mot de passe incorrect.";
    case "auth/email-already-in-use":
      return "Cet email est déjà utilisé.";
    case "auth/weak-password":
      return "Mot de passe trop faible (min. 6 caractères).";
    case "auth/invalid-email":
      return "Email invalide.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Connexion Google annulée.";
    case "auth/network-request-failed":
      return "Problème de réseau. Réessayez.";
    default:
      return "Erreur d'authentification. Réessayez.";
  }
}

export function AuthModal() {
  const { loginModalOpen, openLogin, loadMe } = useApp();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", username: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Resolved after mount to avoid a hydration mismatch on the social buttons.
  const [native, setNative] = useState(false);
  const [isIos, setIsIos] = useState(false);
  useEffect(() => {
    setNative(isNativeApp());
    setIsIos(nativePlatform() === "ios");
  }, []);
  const dialogRef = useDialog(loginModalOpen, () => openLogin(false));

  if (!loginModalOpen) return null;

  // Exchange a Firebase ID token for our own JWT pair, then load the profile.
  async function finish(idToken: string) {
    const tokens = await api.loginFirebase(idToken);
    tokenStore.set(tokens.access_token, tokens.refresh_token);
    await loadMe();
    openLogin(false);
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
        if (form.username) await updateProfile(cred.user, { displayName: form.username });
        // Force-refresh so the ID token carries the new displayName.
        await finish(await cred.user.getIdToken(true));
      } else {
        const cred = await signInWithEmailAndPassword(auth, form.email, form.password);
        await finish(await cred.user.getIdToken());
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(code ? frError(code) : err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setBusy(true);
    setError(null);
    try {
      if (native) {
        await finish(await nativeSignIn("google"));
      } else {
        const cred = await signInWithPopup(auth, googleProvider);
        await finish(await cred.user.getIdToken());
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(code ? frError(code) : "Erreur Google");
    } finally {
      setBusy(false);
    }
  }

  async function appleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await finish(await nativeSignIn("apple"));
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(code ? frError(code) : "Erreur Apple");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "login" ? "Connexion" : "Créer un compte"}
      className="fixed inset-0 z-[60] grid place-items-end bg-black/40 backdrop-blur-sm outline-none sm:place-items-center"
      onClick={() => openLogin(false)}
    >
      <div
        className="w-full max-w-md rounded-t-xl bg-surface-container-lowest p-6 shadow-float sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <LogoMark className="h-10 w-10 text-[#15245c] dark:text-[#89ceff]" />
            <h2 className="text-headline-md text-on-surface">
              {mode === "login" ? "Bon retour 👋" : "Créer un compte"}
            </h2>
          </div>
          <button onClick={() => openLogin(false)} aria-label="Fermer" className="text-on-surface-variant">
            <Icon name="close" />
          </button>
        </div>

        {/* Google */}
        <button
          onClick={googleSignIn}
          disabled={busy}
          className="mb-4 flex w-full items-center justify-center gap-3 rounded-full border border-outline-variant/60 bg-surface-container-lowest py-3 text-label-lg text-on-surface transition-all hover:border-primary active:scale-95 disabled:opacity-60"
        >
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continuer avec Google
        </button>

        {/* Apple — required by App Store guidelines when other social logins are offered. */}
        {isIos && (
          <button
            onClick={appleSignIn}
            disabled={busy}
            className="mb-4 flex w-full items-center justify-center gap-3 rounded-full bg-black py-3 text-label-lg text-white transition-all active:scale-95 disabled:opacity-60"
          >
            <svg viewBox="0 0 384 512" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
            </svg>
            Continuer avec Apple
          </button>
        )}

        <div className="mb-4 flex items-center gap-3 text-micro uppercase tracking-wider text-on-surface-variant">
          <hr className="flex-1 border-outline-variant/30" /> ou <hr className="flex-1 border-outline-variant/30" />
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-full bg-surface-container p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              className={`rounded-full py-2 text-label-md transition-all ${
                mode === m ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant"
              }`}
            >
              {m === "login" ? "Connexion" : "Inscription"}
            </button>
          ))}
        </div>

        <form onSubmit={submitEmail} className="space-y-3">
          {mode === "register" && (
            <input
              className="input"
              placeholder="Pseudo"
              aria-label="Pseudo"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          )}
          <input
            className="input"
            type="email"
            placeholder="Email"
            aria-label="Adresse email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Mot de passe"
            aria-label="Mot de passe"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          {error && (
            <p role="alert" className="animate-fade-in-up text-label-md text-error">
              {error}
            </p>
          )}
          <button className="btn-primary w-full py-3" disabled={busy}>
            {busy ? "..." : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>
      </div>
    </div>
  );
}
