// Global auth + UI state (Zustand).
import { signOut } from "firebase/auth";
import { create } from "zustand";

import { ApiError, api } from "./api";
import { auth } from "./firebase";
import { clearOffline, isNetworkError, readCopy } from "./offline";
import { isNativeApp } from "./platform";
import { unregisterPush } from "./push";
import { logWarn } from "./logger";
import { tokenStore } from "./tokens";
import type { User } from "./types";

interface AppState {
  user: User | null;
  loading: boolean;
  loginModalOpen: boolean;
  /** The Premium offer, opened by a paid feature answering 402 or by the account page. */
  premiumOpen: boolean;
  loadMe: () => Promise<void>;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
  openLogin: (open: boolean) => void;
  openPremium: (open: boolean) => void;
}

export const useApp = create<AppState>((set) => ({
  user: null,
  loading: true,
  loginModalOpen: false,
  premiumOpen: false,
  async loadMe() {
    if (!tokenStore.access) {
      set({ loading: false });
      return;
    }
    try {
      const user = await api.me();
      set({ user, loading: false });
    } catch (e) {
      // No network is not a logout: opening the app in a shop with no signal
      // used to clear the session. Keep it, with the account last seen.
      // Same for a server that is down or restarting (502, 503…): only a
      // refused session (401, 403) is a logout.
      const refused = e instanceof ApiError && (e.status === 401 || e.status === 403);
      if (isNetworkError(e) || !refused) {
        set({ user: readCopy<User>("me"), loading: false });
        return;
      }
      tokenStore.clear();
      set({ user: null, loading: false });
    }
  },
  setUser: (user) => set({ user }),
  logout: async () => {
    // Before the session goes: unregistering needs it.
    await unregisterPush();
    tokenStore.clear();
    clearOffline();
    set({ user: null });
    // Also end the Firebase session (best-effort — ignore if not signed in).
    void signOut(auth).catch((e) => logWarn("logout", `Firebase signOut failed: ${e instanceof Error ? e.message : String(e)}`));
    // Native shell: end the native Firebase session too.
    if (isNativeApp()) {
      void import("@capacitor-firebase/authentication")
        .then(({ FirebaseAuthentication }) => FirebaseAuthentication.signOut())
        .catch((e) => logWarn("logout", `Capacitor Firebase signOut failed: ${e instanceof Error ? e.message : String(e)}`));
    }
  },
  openLogin: (loginModalOpen) => set({ loginModalOpen }),
  openPremium: (premiumOpen) => set({ premiumOpen }),
}));
